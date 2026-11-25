import { useEffect, useMemo, useRef, useState } from 'react';
import { Highlighter, MessageSquare, Moon, Sun, Timer, Underline } from 'lucide-react';
import Button from './components/Button';
import Report from './components/Report';
import { examModes, MODE_STORAGE_KEY, sentenceCount, wordCount } from './lib/exam';
import { escapeMessage } from './lib/format';
import { sampleReport } from './lib/sampleReport';

const LOADER_TIPS = [
  'The examiner is separating score evidence from style preference.',
  'The diagnosis is looking for the cause, not only the surface edit.',
  'The correction coach is turning a mistake into a rule.',
  'The synthesis is writing the next practice step.',
];

const LOADER_NAMES = ['Examiner', 'Diagnosis', 'Coach', 'Synthesis'];

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readMode() {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  return examModes[stored] ? stored : 'IELTS';
}

export default function App() {
  const preview = useMemo(() => new URLSearchParams(window.location.search).get('sheet') === 'sample', []);
  const [mode, setMode] = useState(readMode);
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
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [phase, setPhase] = useState(preview ? 'report' : 'empty');
  const [report, setReport] = useState(preview ? sampleReport : null);
  const [tip, setTip] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(config.tasks['2'].timeMinutes * 60);
  const [timerLeft, setTimerLeft] = useState(config.tasks['2'].timeMinutes * 60);
  const [timerOn, setTimerOn] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [exporting, setExporting] = useState(false);
  const questionRef = useRef(null);
  const reportRef = useRef(null);
  const imageRef = useRef(null);

  const task = config.tasks[part] || config.tasks['2'];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ielts-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#100e0c' : '#1c1915';
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    const next = examModes[mode];
    setTarget(next.defaultTarget);
    setPart('2');
  }, [mode]);

  useEffect(() => {
    const minutes = task.timeMinutes;
    setTimerSeconds(minutes * 60);
    setTimerLeft(minutes * 60);
    setTimerOn(false);
    setTimeUp(false);
  }, [mode, part, task.timeMinutes]);

  useEffect(() => {
    document.title = `Writing Journey · ${config.label} ${task.label}`;
  }, [config.label, task.label]);

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

  useEffect(() => {
    function onKey(event) {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      setTimerOpen(false);
      setChatOpen(false);
      setConfirm(null);
      setTimeUp(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const count = wordCount(answer);
  const countWarn = count > 0 && (count < task.minWords || (task.maxWords && count > task.maxWords));
  const countTone = count === 0 ? '' : countWarn ? 'count-warn' : 'count-ready';
  const meterWidth = Math.max(0, Math.min(100, task.minWords ? (count / task.minWords) * 100 : 0));
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

  function clearImage() {
    setImageName('');
    setImagePreview('');
    setImageData('');
    if (imageRef.current) imageRef.current.value = '';
  }

  async function generateQuestion() {
    setGenerating(true);
    setNotice('');
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
      setNotice(error.message || 'Could not generate a question. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function runEvaluation() {
    setConfirm(null);
    setBusy(true);
    setPhase('loading');
    setTip(0);
    setNotice('');
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
          notes,
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

  function onSubmit(event) {
    event.preventDefault();
    const sentences = sentenceCount(answer);
    if (task.oneSentence && sentences > 1) {
      setConfirm('sentence');
      return;
    }
    if (countWarn) {
      setConfirm('length');
      return;
    }
    runEvaluation();
  }

  async function sendChat(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const history = messages.slice(-8);
    setMessages((items) => [...items, { role: 'user', content: text }]);
    setChatInput('');
    setChatBusy(true);
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
    } finally {
      setChatBusy(false);
    }
  }

  async function exportPdf() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--sheet').trim() || '#fbf8f3';
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor });
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

  const confirmCopy = confirm === 'sentence'
    ? 'Summarize Written Text should be one sentence. Mark this draft anyway?'
    : `This draft is outside the recommended range (${task.guidance}). Mark it anyway?`;

  return (
    <div className="app">
      <a className="skip" href="#ielts-form">Skip to the draft</a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">WJ</span>
          <div>
            <h1>Writing Journey</h1>
            <p className="session">{config.label} · {task.label} · target {target}</p>
          </div>
        </div>
        <div className="top-actions">
          <fieldset className="mode-switch" aria-label="Writing test mode">
            {['IELTS', 'PTE'].map((value) => (
              <label key={value}>
                <input className="sr-only" type="radio" name="writing-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                <span>{value}</span>
              </label>
            ))}
          </fieldset>
          <Button id="timer-toggle" tone="ghost" aria-expanded={timerOpen} aria-label={`Exam timer ${clock}`} onClick={() => setTimerOpen((open) => !open)}>
            <Timer size={16} />
            <span>{clock}</span>
          </Button>
          <Button id="draggable-chatbot" tone="ghost" aria-expanded={chatOpen} onClick={() => setChatOpen((open) => !open)}>
            <MessageSquare size={16} />
            Ask
          </Button>
          <Button id="theme-toggle" tone="ghost" className="btn-icon" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </header>

      <main className="workspace">
        <form id="ielts-form" className="script" onSubmit={onSubmit}>
          <div className="script-body">
            <div className="field-row">
              <label className="field" id="target-label">
                {config.targetLabel}
                <select id="band-select" value={target} onChange={(event) => setTarget(event.target.value)} required>
                  {config.targetValues.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="field" id="part-label">
                {mode === 'PTE' ? 'Writing task' : 'Writing part'}
                <select id="part-select" value={part} onChange={(event) => setPart(event.target.value)} required>
                  {Object.entries(config.tasks).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <div>
              <div className="prompt-head">
                <label id="question-label" htmlFor="question-display">Question</label>
                <div role="group" aria-label="Prompt marks">
                  <Button id="btn-highlight" tone="quiet" onClick={() => markQuestion('hiliteColor')}><Highlighter size={14} /> Highlight</Button>
                  <Button id="btn-underline" tone="quiet" onClick={() => markQuestion('underline')}><Underline size={14} /> Underline</Button>
                </div>
              </div>
              <div
                id="question-display"
                ref={questionRef}
                className="prompt"
                contentEditable={!busy}
                role="textbox"
                aria-multiline="true"
                aria-labelledby="question-label"
                data-placeholder={config.questionPlaceholder}
                onInput={(event) => setQuestion(event.currentTarget.innerText)}
              />
              <textarea id="question-input" className="sr-only" value={question} readOnly tabIndex={-1} aria-hidden="true" />
              <div className="tool-row">
                <Button id="generate-question-btn" tone="quiet" onClick={generateQuestion} disabled={generating || busy}>
                  {generating ? 'Generating…' : 'Generate question'}
                </Button>
                <label className="file-btn">
                  Upload question image
                  <input id="image-input" ref={imageRef} className="sr-only" type="file" accept="image/*" onChange={onImage} />
                </label>
                <span id="image-file-name" className="file-name">{imageName}</span>
              </div>
              {notice ? <p className="notice" role="alert">{notice}</p> : null}
              {imagePreview ? (
                <div className="preview">
                  <img id="image-preview" src={imagePreview} alt="Question preview" />
                  <Button tone="quiet" onClick={clearImage}>Remove image</Button>
                </div>
              ) : <div id="image-preview" />}
            </div>

            <div>
              <Button tone="quiet" id="show-note-btn" onClick={() => setNotesOpen((open) => !open)} aria-expanded={notesOpen}>
                {notesOpen ? 'Hide planning notes' : 'Add planning notes'}
              </Button>
              {notesOpen ? (
                <textarea id="note-input" className="notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Point, example, result" />
              ) : null}
            </div>

            <div className="answer-block">
              <div className="answer-head">
                <label htmlFor="answer-input">Your answer</label>
                <Button tone="quiet" aria-label="Expand answer editor" onClick={() => setExpanded(true)}>Expand</Button>
              </div>
              <textarea id="answer-input" className="script-area" value={answer} onChange={(event) => setAnswer(event.target.value)} required placeholder="Paste or type your answer here." />
            </div>
          </div>
          <div className="script-bar">
            <div className="count-row">
              <div className="meter" data-tone={countWarn ? 'short' : 'ready'} aria-hidden="true">
                <span style={{ width: `${meterWidth}%` }} />
              </div>
              <p id="word-count" className={countTone}>{count} words · {task.guidance}</p>
            </div>
            <Button id="submit-btn" tone="pen" type="submit" disabled={busy}>
              {busy ? 'Marking…' : 'Mark this draft'}
            </Button>
          </div>
        </form>

        <section id="result-section" className="mark-panel" aria-live="polite">
          <div className="mark-body" ref={reportRef}>
            {phase === 'loading' ? (
              <div id="loading-state" className="loading-sheet">
                <h2>The examiner is reading this draft.</h2>
                <ol>
                  {LOADER_NAMES.map((name, index) => (
                    <li key={name} aria-current={index === tip ? 'step' : undefined}>{name}</li>
                  ))}
                </ol>
                <p id="loader-tip">{LOADER_TIPS[tip]}</p>
              </div>
            ) : (
              <Report report={phase === 'empty' ? null : report} mode={mode} part={part} target={target} onExport={exportPdf} exporting={exporting} />
            )}
          </div>
        </section>
      </main>

      {expanded ? (
        <div className="veil" role="dialog" aria-modal="true" aria-labelledby="answer-modal-title">
          <div className="modal">
            <header>
              <h2 id="answer-modal-title">Your answer</h2>
              <Button tone="quiet" aria-label="Collapse editor" onClick={() => setExpanded(false)}>Close</Button>
            </header>
            <textarea id="answer-modal-input" className="script-area" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <p id="answer-modal-word-count" className="count-row">{count} words · {task.guidance}</p>
          </div>
        </div>
      ) : null}

      {timerOpen ? (
        <div id="timer-panel" className="timer-panel">
          <header>
            <h2>Exam timer</h2>
            <Button tone="quiet" aria-label="Close timer" onClick={() => setTimerOpen(false)}>Close</Button>
          </header>
          <p id="timer-display" className="clock" data-urgent={timerLeft < 60 && (timerOn || timerLeft === 0)}>{clock}</p>
          <div className="preset-row">
            {[5, 10, 20, 40, 60].map((minutes) => (
              <Button key={minutes} tone="quiet" disabled={timerOn} onClick={() => { setTimerSeconds(minutes * 60); setTimerLeft(minutes * 60); }}>{minutes}m</Button>
            ))}
          </div>
          <div className="timer-actions">
            <Button id="timer-start" tone="pen" onClick={() => setTimerOn((on) => !on)}>{timerOn ? 'Pause' : 'Start'}</Button>
            <Button id="timer-reset" tone="quiet" onClick={() => { setTimerOn(false); setTimerLeft(timerSeconds); setTimeUp(false); }}>Reset</Button>
          </div>
        </div>
      ) : null}

      {timeUp ? (
        <div className="veil" role="dialog" aria-modal="true" aria-label="Time is up">
          <div className="dialog">
            <h2>Time is up.</h2>
            <p>Your timed session has ended. You can keep writing.</p>
            <div className="dialog-actions">
              <Button id="timer-timeout-dismiss" tone="pen" onClick={() => setTimeUp(false)}>Continue writing</Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="veil" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="dialog">
            <h2 id="confirm-title">Check this draft</h2>
            <p>{confirmCopy}</p>
            <div className="dialog-actions">
              <Button tone="quiet" onClick={() => setConfirm(null)}>Keep writing</Button>
              <Button tone="pen" onClick={runEvaluation}>Mark this draft</Button>
            </div>
          </div>
        </div>
      ) : null}

      {chatOpen ? (
        <section id="chatbox" className="chat-panel" aria-label="Writing assistant">
          <header>
            <h2>Writing assistant</h2>
            <Button id="close-chatbox" tone="quiet" aria-label="Close chat" onClick={() => setChatOpen(false)}>Close</Button>
          </header>
          <div id="chatbox-messages" className="chat-log">
            {messages.length === 0 ? <p className="chat-empty">Ask about the task, this mark, or the next drill.</p> : null}
            {messages.map((item, index) => (
              <p key={`${item.role}-${index}`} className={item.role === 'user' ? 'bubble bubble-user' : 'bubble'} dangerouslySetInnerHTML={{ __html: escapeMessage(item.content) }} />
            ))}
            {chatBusy ? <p className="chat-empty">The examiner is reading your question.</p> : null}
          </div>
          <form id="chatbox-form" className="chat-form" onSubmit={sendChat}>
            <textarea id="chatbox-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={config.chatPlaceholder} required maxLength={1000} />
            <Button tone="pen" type="submit" disabled={chatBusy}>Send</Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
