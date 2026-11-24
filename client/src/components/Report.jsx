import CountUp from './CountUp';
import Button from './Button';
import { criterionLabels, examModes } from '../lib/exam';
import { renderCorrectedDraft, renderSafeMarkdown } from '../lib/format';

function EmptyNote({ children }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export default function Report({ report, onExport, exporting }) {
  if (!report) {
    return (
      <div className="max-w-[28rem] pt-6">
        <h2 className="max-w-[18ch] text-4xl font-semibold tracking-tight text-ink">Your mark sheet is empty.</h2>
        <p className="mt-4 max-w-[42ch] text-base leading-7 text-muted">
          Submit a draft. The examiner, diagnosis, correction, and practice plan will land here.
        </p>
      </div>
    );
  }

  if (report.error) {
    return (
      <div className="rounded-lg border border-line bg-sheet p-6">
        <h2 className="text-2xl font-semibold">The mark did not finish.</h2>
        <p className="mt-3 max-w-[48ch] leading-7 text-muted">{report.error}</p>
      </div>
    );
  }

  const mode = examModes[report.mode] || examModes.IELTS;
  const precision = report.scoreScale?.precision ?? mode.scorePrecision;
  const criteria = Object.keys(report.criteria || {});

  return (
    <article id="report-content" className="space-y-10">
      <header className="grid items-end gap-6 border-b border-line pb-6 md:grid-cols-[180px_1fr]">
        <div>
          <p id="score-label" className="text-6xl font-semibold leading-none tracking-tight text-pen">
            {report.mode === 'PTE' ? (
              <>
                <CountUp to={report.score} />
                <span className="text-3xl text-muted">/{report.scoreScale?.max || mode.scoreMax}</span>
              </>
            ) : (
              <CountUp to={report.score} decimals={precision} />
            )}
          </p>
          <p id="score-notice" className="mt-3 max-w-[16rem] text-sm leading-5 text-muted">
            {report.scoreNotice || 'Practice estimate. This is not an official test score.'}
          </p>
        </div>
        <div id="criterion-bars" className="grid gap-3">
          {criteria.map((key) => {
            const value = Number(report[key] ?? report.criteria?.[key]?.score ?? 0);
            const barMax = Number(report.criteria?.[key]?.max || report.scoreScale?.max || mode.scoreMax);
            const shown = report.mode === 'PTE' ? `${value}/${barMax}` : value.toFixed(precision);
            return (
              <div key={key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{key}</span>
                  <strong className="tabular-nums">{shown}</strong>
                </div>
                <div className="h-2 rounded-full bg-line">
                  <div className="h-2 rounded-full bg-pen" style={{ width: `${Math.max(0, Math.min(100, (value / barMax) * 100))}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Teacher overview</h2>
        <p id="overview-output" className="max-w-[68ch] leading-7">{report.overview}</p>
        <div id="target-gap-output" className="mt-4 flex flex-wrap gap-2">
          {(report.targetBandGap || []).map((item) => (
            <span key={item} className="rounded-full bg-desk px-3 py-1 text-sm">{item}</span>
          ))}
        </div>
        <ol id="priority-output" className="mt-4 space-y-2">
          {(report.topPriorities || []).map((item, index) => (
            <li key={item} className="flex gap-3 leading-6">
              <span className="tabular-nums text-pen">{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Criterion evidence</h2>
        <div id="criteria-output" className="grid gap-4">
          {criteria.map((key) => {
            const detail = report.criteria?.[key] || {};
            const label = detail.label || criterionLabels[key] || key;
            return (
              <article key={key} className="border-t border-line pt-4">
                <h3 className="text-lg font-semibold">{label}</h3>
                <p className="mt-1 text-sm tabular-nums text-pen">{Number(report[key] || detail.score || 0).toFixed(precision)} / {detail.max || report.scoreScale?.max}</p>
                <p className="mt-2 max-w-[68ch] leading-7">{detail.reason || report[`${key}_reason`]}</p>
                <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-muted">
                  {(detail.evidence || []).map((item) => <li key={item}>{item}</li>)}
                </ul>
                {detail.nextStep ? <p className="mt-2 text-sm text-pen">{detail.nextStep}</p> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Sentence clinic</h2>
        <div id="sentence-output" className="space-y-3">
          {(report.sentenceInsights || []).length ? report.sentenceInsights.map((item) => (
            <details key={`${item.sentenceNumber}-${item.original}`} className="border-t border-line pt-3">
              <summary className="cursor-pointer font-medium">{item.original || `Sentence ${item.sentenceNumber}`}</summary>
              <p className="mt-2 leading-7">{item.revised}</p>
              <p className="text-sm leading-6 text-muted">Why: {item.whyWrong}</p>
              <p className="text-sm leading-6 text-pen">Rule: {item.principle}</p>
            </details>
          )) : <EmptyNote>No sentence-level insights were supplied.</EmptyNote>}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Idea depth</h2>
          <div id="idea-output" className="space-y-4">
            {(report.ideaInsights || []).length ? report.ideaInsights.map((item) => (
              <article key={item.originalIdea}>
                <h3 className="font-semibold">{item.originalIdea}</h3>
                <p className="mt-1 leading-6">{item.problem}</p>
                <p className="mt-1 text-sm text-pen">{item.deeperAlternative}</p>
              </article>
            )) : <EmptyNote>No idea-depth notes were supplied.</EmptyNote>}
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Coherence flow</h2>
          <div id="cohesion-output" className="space-y-4">
            {(report.cohesionMap || []).length ? report.cohesionMap.map((item) => (
              <div key={item.step} className="flex gap-3">
                <span className="tabular-nums text-pen">{item.step}</span>
                <div>
                  <strong>{item.role}</strong>
                  <p className="leading-6">{item.linkQuality}</p>
                  <p className="text-sm text-pen">{item.improvement}</p>
                </div>
              </div>
            )) : <EmptyNote>No coherence map was supplied.</EmptyNote>}
          </div>
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Vocabulary upgrades</h2>
          <div id="vocab-output">
            {(report.vocabularyUpgrades || []).length ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 font-semibold">Original</th>
                    <th className="py-2 font-semibold">Upgrade</th>
                    <th className="py-2 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {report.vocabularyUpgrades.map((item) => (
                    <tr key={`${item.original}-${item.upgrade}`} className="border-b border-line align-top">
                      <td className="py-2 pr-3">{item.original}</td>
                      <td className="py-2 pr-3">{item.upgrade}</td>
                      <td className="py-2">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyNote>No vocabulary upgrades were supplied.</EmptyNote>}
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-2xl font-semibold">Grammar patterns</h2>
          <div id="grammar-output" className="space-y-4">
            {(report.grammarPatterns || []).length ? report.grammarPatterns.map((item) => (
              <article key={item.pattern}>
                <h3 className="font-semibold">{item.pattern}</h3>
                <p className="mt-1 leading-6">{item.problem}</p>
                <p className="mt-1 text-sm text-pen">{item.exampleFix}</p>
              </article>
            )) : <EmptyNote>No grammar patterns were supplied.</EmptyNote>}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Corrected draft</h2>
        <div id="correction-output" className="essay-sheet max-w-[68ch] rounded-md bg-sheet px-4 py-3 leading-8" dangerouslySetInnerHTML={{ __html: renderCorrectedDraft(report.correction || '') }} />
        <ul id="correction-notes-output" className="mt-3 list-disc pl-5 text-sm leading-6">
          {(report.correctionNotes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Model answer</h2>
        <div id="model-answer-output" className="essay-sheet max-w-[68ch] rounded-md bg-sheet px-4 py-3 leading-8" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(report.modelAnswer || '') }} />
        <ul id="model-notes-output" className="mt-3 list-disc pl-5 text-sm leading-6">
          {(report.modelAnswerNotes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Practice plan</h2>
        <div id="practice-output" className="grid gap-4">
          {(report.practicePlan || []).map((item) => (
            <article key={`${item.priority}-${item.focus}`} className="border-t border-line pt-3">
              <h3 className="font-semibold">{item.priority}. {item.focus}</h3>
              <p className="mt-1 leading-6">{item.drill}</p>
              <p className="mt-1 text-sm text-pen">{item.successSignal}</p>
            </article>
          ))}
        </div>
      </section>

      <Button id="export-pdf-btn" tone="quiet" onClick={onExport} disabled={exporting}>
        {exporting ? 'Preparing PDF…' : 'Export PDF'}
      </Button>
    </article>
  );
}
