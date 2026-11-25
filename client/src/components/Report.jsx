import CountUp from './CountUp';
import Button from './Button';
import { criterionLabels, examModes } from '../lib/exam';
import { renderCorrectedDraft, renderSafeMarkdown } from '../lib/format';

const SHEET_CONTENTS = ['Criterion evidence', 'Diagnosis', 'Sentence clinic', 'Corrected draft', 'Model answer', 'Practice plan'];

function EmptyNote({ children }) {
  return <p className="prose">{children}</p>;
}

export default function Report({ report, onExport, exporting, mode = 'IELTS', part = '2', target = '' }) {
  const config = examModes[report?.mode || mode] || examModes.IELTS;
  const task = config.tasks[part] || config.tasks['2'];

  if (!report) {
    return (
      <div id="empty-state" className="blank-sheet">
        <h2>Your mark sheet is empty.</h2>
        <p>Submit a draft. The examiner, diagnosis, correction, and practice plan will land here.</p>
        <p className="blank-session">{config.label} · {task.label} · target {target} · {task.timeMinutes} minutes</p>
        <dl className="blank-criteria">
          {task.traits.map((trait) => (
            <div key={trait.key}>
              <dt>{trait.label}</dt>
              <dd>— / {trait.max}</dd>
            </div>
          ))}
        </dl>
        <ul className="blank-contents">
          {SHEET_CONTENTS.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    );
  }

  if (report.error) {
    return (
      <div className="mark-error">
        <h2>The mark did not finish.</h2>
        <p>{report.error}</p>
        <p>Check the draft, then mark it again.</p>
      </div>
    );
  }

  const precision = report.scoreScale?.precision ?? config.scorePrecision;
  const criteria = Object.keys(report.criteria || {});
  const scoreMax = report.scoreScale?.max || config.scoreMax;

  return (
    <article id="report-content" className="mark-sheet">
      <header className="mark-head">
        <div>
          <p id="score-label" className="mark-score">
            <span className="sr-only">{report.mode === 'PTE' ? `${report.score}/${scoreMax}` : Number(report.score).toFixed(precision)}</span>
            <span aria-hidden="true">
              {report.mode === 'PTE' ? (
                <>
                  <CountUp to={report.score} />
                  <span>/{scoreMax}</span>
                </>
              ) : (
                <CountUp to={report.score} decimals={precision} />
              )}
            </span>
          </p>
          <p id="score-notice" className="mark-notice">
            {report.scoreNotice || 'Practice estimate. This is not an official test score.'}
          </p>
          {report.wordCount ? <p className="mark-meta">{report.wordCount} words counted in this draft.</p> : null}
        </div>
        <Button id="export-pdf-btn" tone="quiet" onClick={onExport} disabled={exporting}>
          {exporting ? 'Preparing PDF…' : 'Export PDF'}
        </Button>
      </header>

      <nav className="mark-nav" aria-label="Mark sheet sections">
        <a href="#overview-output">Overview</a>
        <a href="#criteria-output">Criteria</a>
        <a href="#sentence-output">Sentences</a>
        <a href="#correction-output">Draft</a>
        <a href="#model-answer-output">Model</a>
        <a href="#practice-output">Practice</a>
      </nav>

      <div id="criterion-bars" className="criterion-list">
        {criteria.map((key) => {
          const value = Number(report[key] ?? report.criteria?.[key]?.score ?? 0);
          const barMax = Number(report.criteria?.[key]?.max || scoreMax);
          const label = report.criteria?.[key]?.label || criterionLabels[key] || key;
          const shown = report.mode === 'PTE' ? `${value}/${barMax}` : value.toFixed(precision);
          return (
            <div key={key}>
              <p>
                <span>{label}</span>
                <strong>{shown}</strong>
              </p>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, (value / barMax) * 100))}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <section className="sheet-section" id="overview-section">
        <h2>Teacher overview</h2>
        <p id="overview-output" className="prose">{report.overview}</p>
        {report.encouragement ? <p className="prose">{report.encouragement}</p> : null}
        <ul id="target-gap-output" className="chips">
          {(report.targetBandGap || []).map((item) => <li key={item}>{item}</li>)}
        </ul>
        <ol id="priority-output" className="priority-list">
          {(report.topPriorities || []).map((item, index) => (
            <li key={item}>
              <span className="num">{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="sheet-section">
        <h2>Criterion evidence</h2>
        <div id="criteria-output" className="stack">
          {criteria.map((key) => {
            const detail = report.criteria?.[key] || {};
            const label = detail.label || criterionLabels[key] || key;
            return (
              <article key={key} className="criterion-block">
                <h3>{label}</h3>
                <p className="score-line">{Number(report[key] || detail.score || 0).toFixed(precision)} / {detail.max || scoreMax}</p>
                <p className="prose">{detail.reason || report[`${key}_reason`]}</p>
                <ul className="evidence">
                  {(detail.evidence || []).map((item) => <li key={item}>{item}</li>)}
                </ul>
                {detail.nextStep ? <p className="next-step">{detail.nextStep}</p> : null}
              </article>
            );
          })}
        </div>
      </section>

      {(report.diagnostics || []).length ? (
        <section className="sheet-section">
          <h2>Diagnosis</h2>
          <div id="diagnosis-output" className="stack">
            {report.diagnostics.map((item) => (
              <article key={`${item.criterion}-${item.issue}`} className="criterion-block">
                <h3>{criterionLabels[item.criterion] || item.criterion}: {item.issue}</h3>
                <p className="prose">{item.rootCause}</p>
                <p className="prose">{item.whyItMatters}</p>
                <p className="next-step">{item.fixStrategy}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sheet-section">
        <h2>Sentence clinic</h2>
        <div id="sentence-output" className="stack">
          {(report.sentenceInsights || []).length ? report.sentenceInsights.map((item) => (
            <details key={`${item.sentenceNumber}-${item.original}`} className="clinic">
              <summary>{item.original || `Sentence ${item.sentenceNumber}`}</summary>
              <p>{item.revised}</p>
              <p>Why: {item.whyWrong}</p>
              <p className="rule">Rule: {item.principle}</p>
            </details>
          )) : <EmptyNote>No sentence-level insights were supplied.</EmptyNote>}
        </div>
      </section>

      <section className="sheet-section pair">
        <div>
          <h2>Idea depth</h2>
          <div id="idea-output" className="stack">
            {(report.ideaInsights || []).length ? report.ideaInsights.map((item) => (
              <article key={item.originalIdea}>
                <h3>{item.originalIdea}</h3>
                <p>{item.problem}</p>
                <p className="next-step">{item.deeperAlternative}</p>
              </article>
            )) : <EmptyNote>No idea-depth notes were supplied.</EmptyNote>}
          </div>
        </div>
        <div>
          <h2>Coherence flow</h2>
          <div id="cohesion-output" className="stack">
            {(report.cohesionMap || []).length ? report.cohesionMap.map((item) => (
              <div key={item.step}>
                <h3><span className="num">{item.step}</span> {item.role}</h3>
                <p>{item.linkQuality}</p>
                <p className="next-step">{item.improvement}</p>
              </div>
            )) : <EmptyNote>No coherence map was supplied.</EmptyNote>}
          </div>
        </div>
      </section>

      <section className="sheet-section pair">
        <div>
          <h2>Vocabulary upgrades</h2>
          <div id="vocab-output">
            {(report.vocabularyUpgrades || []).length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Original</th>
                    <th>Upgrade</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {report.vocabularyUpgrades.map((item) => (
                    <tr key={`${item.original}-${item.upgrade}`}>
                      <td>{item.original}</td>
                      <td>{item.upgrade}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyNote>No vocabulary upgrades were supplied.</EmptyNote>}
          </div>
        </div>
        <div>
          <h2>Grammar patterns</h2>
          <div id="grammar-output" className="stack">
            {(report.grammarPatterns || []).length ? report.grammarPatterns.map((item) => (
              <article key={item.pattern}>
                <h3>{item.pattern}</h3>
                <p>{item.problem}</p>
                <p className="next-step">{item.exampleFix}</p>
              </article>
            )) : <EmptyNote>No grammar patterns were supplied.</EmptyNote>}
          </div>
        </div>
      </section>

      <section className="sheet-section">
        <h2>Corrected draft</h2>
        <div id="correction-output" className="draft" dangerouslySetInnerHTML={{ __html: renderCorrectedDraft(report.correction || '') }} />
        <ul id="correction-notes-output" className="plain-list">
          {(report.correctionNotes || []).map((note) => (
            <li key={note}><span className="num">·</span><span>{note}</span></li>
          ))}
        </ul>
      </section>

      <section className="sheet-section">
        <h2>Model answer</h2>
        <div id="model-answer-output" className="draft" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(report.modelAnswer || '') }} />
        <ul id="model-notes-output" className="plain-list">
          {(report.modelAnswerNotes || []).map((note) => (
            <li key={note}><span className="num">·</span><span>{note}</span></li>
          ))}
        </ul>
      </section>

      <section className="sheet-section">
        <h2>Practice plan</h2>
        <div id="practice-output" className="stack">
          {(report.practicePlan || []).map((item) => (
            <article key={`${item.priority}-${item.focus}`} className="plan-block">
              <h3>{item.priority}. {item.focus}</h3>
              <p>{item.drill}</p>
              <p className="next-step">{item.successSignal}</p>
            </article>
          ))}
        </div>
      </section>
    </article>
  );
}
