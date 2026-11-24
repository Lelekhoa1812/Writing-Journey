import { useEffect, useMemo, useRef, useState } from 'react';
import { Highlighter, MessageSquare, Moon, Sun, Timer, Underline } from 'lucide-react';
import Button from './components/Button';
import Report from './components/Report';
import { examModes, MODE_STORAGE_KEY, sentenceCount, wordCount } from './lib/exam';
import { escapeMessage } from './lib/format';

const LOADER_TIPS = [
  'The examiner is separating score evidence from style preference.',
  'The diagnosis is looking for the cause, not only the surface edit.',
  'The correction coach is turning a mistake into a rule.',
  'The synthesis is writing the next practice step.',
];

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_STORAGE_KEY) || 'IELTS');
  const [theme, setTheme] = useState(() => localStorage.getItem('ielts-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const config = examModes[mode] || examModes.IELTS;
  const [target, setTarget] = useState(config.defaultTarget);
  const [part, setPart] = useState('2');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [imageName, setImageName] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageData, setImageData] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('empty');
  const [report, setReport] = useState(null);
  const [tip, setTip] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(20 * 60);
  const [timerLeft, setTimerLeft] = useState(20 * 60);
  const [timerOn, setTimerOn] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [exporting, setExporting] = useState(false);
  const questionRef = useRef(null);
  const reportRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ielts-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    const next = examModes[mode];
    setTarget(next.defaultTarget);
    setPart('2');
  }, [mode]);

  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setTip((value) => (value + 1) % LOADER_TIPS.length), 2200);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => {
    if (!timerOn) return undefined;
    const id = setInterval(() => {
      setTimerLeft((value) => {
        if (value <= 1) {
          setTimerOn(false);
          setTimeUp(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerOn]);

  const task = config.tasks[part] || config.tasks['2'];
  const count = wordCount(answer);
  const countWarn = count > 0 && (count < task.minWords || (task.maxWords && count > task.maxWords));
  const countTone = count === 0 ? 'text-muted' : countWarn ? 'text-warn' : 'text-good';
  const clock = useMemo(() => {
    const minutes = String(Math.floor(timerLeft / 60)).padStart(2, '0');
    const seconds = String(timerLeft % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [timerLeft]);

  function markQuestion(command) {
    questionRef.current?.focus();
    document.execCommand(command, false, command === 'hiliteColor' ? '#fde68a' : null);
    setQuestion(questionRef.current?.innerText || '');
  }

  async function onImage(event) {
    const file = event.target.files?.[0];
    setImageName(file ? file.name : '');
    if (!file) {
      setImagePreview('');
      setImageData('');
      return;
    }
    const data = await readFile(file);
    setImagePreview(data);
    setImageData(data);
  }

  async function generateQuestion() {
    setGenerating(true);
    try {
      const response = await fetch('/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, part }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Question generation failed');
      const text = [
        data.sourceText ? `Source Text:\n${data.sourceText}` : '',
        data.question || '',
        [data.recommendedWords ? `Recommended words: ${data.recommendedWords}` : '', data.timeMinutes ? `Time: ${data.timeMinutes} minutes` : ''].filter(Boolean).join('\n'),
      ].filter(Boolean).join('\n\n');
      setQuestion(text);
      if (questionRef.current) questionRef.current.innerText = text;
    } catch (error) {
      window.alert(error.message || 'Could not generate a question. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const sentences = sentenceCount(answer);
    if (task.oneSentence && sentences > 1 && !window.confirm('PTE Summarize Written Text should be one sentence. Continue?')) return;
    if (countWarn && !window.confirm(`Your answer is outside the recommended range (${task.guidance}). Continue?`)) return;
    setBusy(true);
    setPhase('loading');
    setTip(0);
    try {
      const response = await fetch('/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          targetScore: target,
          band: target,
          part,
          question,
          answer,
          image: imageData,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Evaluation failed');
      window.latestEvaluationContext = data;
      setReport(data);
      setPhase('report');
    } catch (error) {
      setReport({ error: error.message || 'Could not get evaluation. Please try again.' });
      setPhase('report');
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    const history = messages.slice(-8);
    setMessages((items) => [...items, { role: 'user', content: text }]);
    setChatInput('');
    try {
      const response = await fetch('/chat-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          mode,
          part,
          evaluationContext: window.latestEvaluationContext || null,
        }),
      });
      const data = await response.json();
      setMessages((items) => [...items, { role: 'assistant', content: response.ok ? data.reply : (data.error || 'Could not get a response.') }]);
    } catch {
      setMessages((items) => [...items, { role: 'assistant', content: 'Could not get a response after retrying. Please try again.' }]);
    }
  }

  async function exportPdf() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${config.label}_Evaluation_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-desk text-ink">
      <header className="flex items-center justify-between gap-4 bg-rail px-4 py-3 text-white md:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Writing Journey</h1>
        <div className="flex items-center gap-2">
          <fieldset className="flex rounded-md bg-white/10 p-1" aria-label="Writing test mode">
            {['IELTS', 'PTE'].map((value) => (
              <label key={value} className="cursor-pointer">
                <input className="sr-only" type="radio" name="writing-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                <span className={`block rounded px-3 py-1 text-sm ${mode === value ? 'bg-white text-rail' : ''}`}>{value}</span>
              </label>
            ))}
          </fieldset>
          <Button id="theme-toggle" tone="ghost" className="text-white" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <Button id="timer-toggle" tone="ghost" className="text-white" aria-label="Exam timer" onClick={() => setTimerOpen(true)}>
            <Timer size={16} />
          </Button>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] md:grid-cols-2 md:overflow-hidden">
        <form id="ielts-form" className="border-r border-line bg-sheet p-4 md:overflow-auto md:p-6" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold" id="target-label">
              {config.targetLabel}
              <select id="band-select" className="rounded-md border border-line bg-sheet px-3 py-2 font-normal" value={target} onChange={(event) => setTarget(event.target.value)} required>
                {config.targetValues.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold" id="part-label">
              {mode === 'PTE' ? 'Writing task' : 'Writing part'}
              <select id="part-select" className="rounded-md border border-line bg-sheet px-3 py-2 font-normal" value={part} onChange={(event) => setPart(event.target.value)} required>
                {Object.entries(config.tasks).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-semibold" htmlFor="question-display">Question</label>
              <div className="flex gap-1">
                <Button id="btn-highlight" tone="quiet" aria-label="Highlight" onClick={() => markQuestion('hiliteColor')}><Highlighter size={14} /></Button>
                <Button id="btn-underline" tone="quiet" aria-label="Underline" onClick={() => markQuestion('underline')}><Underline size={14} /></Button>
              </div>
            </div>
            <div
              id="question-display"
              ref={questionRef}
              className="essay-sheet min-h-28 rounded-md border border-line px-3 py-2 outline-none"
              contentEditable={!busy}
              role="textbox"
              aria-multiline="true"
              data-placeholder={config.questionPlaceholder}
              onInput={(event) => setQuestion(event.currentTarget.innerText)}
            />
            <textarea id="question-input" className="sr-only" value={question} readOnly tabIndex={-1} aria-hidden="true" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button id="generate-question-btn" tone="quiet" onClick={generateQuestion} disabled={generating || busy}>
                {generating ? 'Generating…' : 'Generate question'}
              </Button>
              <label className="cursor-pointer rounded-md border border-line px-3 py-2 text-sm font-semibold">
                Upload question image
                <input id="image-input" ref={imageRef} className="sr-only" type="file" accept="image/*" onChange={onImage} />
              </label>
              <span id="image-file-name" className="text-sm text-muted">{imageName || 'No image selected'}</span>
            </div>
            {imagePreview ? <img id="image-preview" className="mt-3 max-h-40 rounded-md border border-line" src={imagePreview} alt="Question preview" /> : <div id="image-preview" />}
          </div>

          <div className="mt-5">
            <Button tone="quiet" id="show-note-btn" onClick={() => setNotesOpen((open) => !open)}>
              {notesOpen ? 'Hide note card' : 'Create note card'}
            </Button>
            {notesOpen ? (
              <textarea id="note-input" className="mt-2 w-full rounded-md border border-line bg-sheet p-3" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Planning notes" />
            ) : null}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold" htmlFor="answer-input">Your answer</label>
              <Button tone="quiet" aria-label="Expand answer editor" onClick={() => setExpanded(true)}>Expand</Button>
            </div>
            <textarea id="answer-input" className="essay-sheet min-h-40 w-full rounded-md border border-line bg-sheet px-3 py-2" value={answer} onChange={(event) => setAnswer(event.target.value)} required placeholder="Paste or type your answer here." />
            <p id="word-count" className={`mt-2 text-sm tabular-nums ${countTone}`}>{count} words · {task.guidance}</p>
          </div>

          <Button id="submit-btn" tone="pen" className="mt-5 w-full py-3 text-base" type="submit" disabled={busy}>
            {busy ? 'Evaluating…' : 'Evaluate deeply'}
          </Button>
        </form>

        <section id="result-section" className="bg-desk p-4 md:overflow-auto md:p-8" aria-live="polite">
          {phase === 'loading' ? (
            <div id="loading-state">
              <p className="text-2xl font-semibold">Specialist agents are reading your essay.</p>
              <ul className="mt-4 space-y-2 text-sm">
                {['Examiner', 'Diagnosis', 'Coach', 'Synthesis'].map((name, index) => (
                  <li key={name} className={index === tip ? 'font-semibold text-pen' : 'text-muted'}>{name}</li>
                ))}
              </ul>
              <p id="loader-tip" className="mt-6 max-w-[46ch] leading-7">{LOADER_TIPS[tip]}</p>
            </div>
          ) : (
            <div ref={reportRef}>
              {phase === 'empty' ? <div id="empty-state"><Report report={null} /></div> : <Report report={report} onExport={exportPdf} exporting={exporting} />}
            </div>
          )}
        </section>
      </main>

      {expanded ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="answer-modal-title">
          <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-sheet p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="answer-modal-title" className="text-lg font-semibold">Your answer</h2>
              <Button tone="quiet" aria-label="Collapse editor" onClick={() => setExpanded(false)}>Close</Button>
            </div>
            <textarea id="answer-modal-input" className="essay-sheet min-h-0 flex-1 rounded-md border border-line p-3" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <p id="answer-modal-word-count" className="mt-2 text-sm tabular-nums">{count} words · {task.guidance}</p>
          </div>
        </div>
      ) : null}

      {timerOpen ? (
        <div id="timer-panel" className="fixed right-4 top-16 z-20 w-72 rounded-lg border border-line bg-sheet p-4 shadow-[0_16px_40px_-24px_rgba(23,32,51,0.45)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Exam timer</h2>
            <Button tone="quiet" aria-label="Close timer" onClick={() => setTimerOpen(false)}>Close</Button>
          </div>
          <p id="timer-display" className="text-center text-4xl font-semibold tabular-nums">{clock}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[5, 10, 20, 40, 60].map((minutes) => (
              <Button key={minutes} tone="quiet" disabled={timerOn} onClick={() => { setTimerSeconds(minutes * 60); setTimerLeft(minutes * 60); }}>{minutes}m</Button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button id="timer-start" tone="pen" onClick={() => setTimerOn((on) => !on)}>{timerOn ? 'Pause' : 'Start'}</Button>
            <Button id="timer-reset" tone="quiet" onClick={() => { setTimerOn(false); setTimerLeft(timerSeconds); }}>Reset</Button>
          </div>
        </div>
      ) : null}

      {timeUp ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-label="Time is up">
          <div className="max-w-sm rounded-lg bg-sheet p-6">
            <h2 className="text-2xl font-semibold">Time is up.</h2>
            <p className="mt-2 leading-6 text-muted">Your timed session has ended. You can keep writing.</p>
            <Button id="timer-timeout-dismiss" tone="pen" className="mt-4" onClick={() => setTimeUp(false)}>Continue writing</Button>
          </div>
        </div>
      ) : null}

      <Button id="draggable-chatbot" tone="pen" className="fixed bottom-5 right-5 z-20 h-12 w-12 rounded-full p-0" aria-label="Open writing assistant" onClick={() => setChatOpen(true)}>
        <MessageSquare size={18} />
      </Button>
      {chatOpen ? (
        <section id="chatbox" className="fixed bottom-20 right-5 z-20 flex h-96 w-[min(100vw-2rem,22rem)] flex-col rounded-lg border border-line bg-sheet shadow-[0_18px_40px_-24px_rgba(23,32,51,0.5)]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">Writing assistant</h2>
            <Button id="close-chatbox" tone="quiet" aria-label="Close chat" onClick={() => setChatOpen(false)}>Close</Button>
          </div>
          <div id="chatbox-messages" className="flex-1 space-y-3 overflow-auto p-3 text-sm leading-6">
            {messages.map((item, index) => (
              <p key={`${item.role}-${index}`} className={item.role === 'user' ? 'text-right' : ''} dangerouslySetInnerHTML={{ __html: escapeMessage(item.content) }} />
            ))}
          </div>
          <form id="chatbox-form" className="flex gap-2 border-t border-line p-2" onSubmit={sendChat}>
            <textarea id="chatbox-input" className="min-h-12 flex-1 rounded-md border border-line p-2" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={config.chatPlaceholder} required maxLength={1000} />
            <Button tone="pen" type="submit">Send</Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
