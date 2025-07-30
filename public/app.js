// UI Elements
const form = document.getElementById('ielts-form');
const bandSelect = document.getElementById('band-select');
const partSelect = document.getElementById('part-select');
const questionInput = document.getElementById('question-input');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const answerInput = document.getElementById('answer-input');
const resultSection = document.getElementById('result-section');
const gauge = document.getElementById('gauge');
const scoreLabel = document.getElementById('score-label');
const correctionOutput = document.getElementById('correction-output');
const modelAnswerOutput = document.getElementById('model-answer-output');
const submitBtn = document.getElementById('submit-btn');
const wordCountDiv = document.getElementById('word-count');
const exportContainer = document.getElementById('export-container');
const exportPdfBtn = document.getElementById('export-pdf-btn');

// Loader tips
const loaderTips = [
  "Tip: Use linking words to improve coherence!",
  "Did you know? Task Achievement is 25% of your IELTS Writing score.",
  "Fun fact: Band 9 answers are rare, but you can get close!",
  "Tip: Vary your sentence structures for higher bands.",
  "Remember: Check your grammar and punctuation!",
  "Tip: For Part 1, always compare key features in the data.",
  "Fun fact: Examiners love clear topic sentences!",
  "Tip: Ever heard of PER technique? This orientates your answer.",
  "Tip: Use Cohesive Devices and Complex Structures for higher bands.",
  "Tip: For Part 2, always plan ahead of writing."
];

function getRandomTip() {
  return loaderTips[Math.floor(Math.random() * loaderTips.length)];
}

let loaderTipInterval = null;
let currentTipIndex = 0;

function getLoaderHTML() {
  return `
    <div class="loader-animation">
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="24" stroke="#4b6cb7" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="110" stroke-dashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
      <div style="margin-top:0.7em;color:#4b6cb7;font-weight:600;">Evaluating...</div>
      <div id="loader-tip" style="margin-top:0.5em;color:#6a7ba2;font-size:0.98em;font-style:italic;min-height:1.5em;">${loaderTips[0]}</div>
    </div>
  `;
}

function startLoaderTipRotation() {
  const tipElem = document.getElementById('loader-tip');
  if (!tipElem) return;
  currentTipIndex = 0;
  loaderTipInterval = setInterval(() => {
    currentTipIndex = (currentTipIndex + 1) % loaderTips.length;
    tipElem.textContent = loaderTips[currentTipIndex];
  }, 2500); // Gap 2.5s
}

function stopLoaderTipRotation() {
  if (loaderTipInterval) {
    clearInterval(loaderTipInterval);
    loaderTipInterval = null;
  }
}

// Image preview logic
imageInput.addEventListener('change', function() {
  imagePreview.innerHTML = '';
  const file = imageInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = document.createElement('img');
      img.src = e.target.result;
      imagePreview.appendChild(img);
    };
    reader.readAsDataURL(file);
  }
});

// Markdown rendering (bold=green, strikethrough=red)
function renderMarkdown(md) {
  if (!md) return '';
  // Replace **bold** with <strong>
  let html = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Replace ~~strike~~ with <del>
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  // Replace line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

// Gauge rendering
function drawGauge(score) {
  // score: float, 0-9
  const min = 4.5, max = 9.0;
  const percent = Math.max(0, Math.min(1, (score - min) / (max - min)));
  const angle = percent * 180;
  const radius = 90;
  const cx = 110, cy = 110;
  const startAngle = 180, endAngle = 0;
  // Color logic
  let color = '#e74c3c'; // red
  if (score >= 6 && score < 7) color = '#f1c40f'; // yellow
  else if (score >= 7 && score < 8) color = '#1db954'; // green
  else if (score >= 8) color = '#a259ff'; // purple
  // Arc calculation
  const largeArc = angle > 180 ? 1 : 0;
  const theta = (angle - 180) * Math.PI / 180;
  const x = cx + radius * Math.cos(theta);
  const y = cy + radius * Math.sin(theta);
  // SVG
  gauge.innerHTML = `
    <path d="M${cx - radius},${cy} A${radius},${radius} 0 1,1 ${cx + radius},${cy}" fill="none" stroke="#eee" stroke-width="18"/>
    <path d="M${cx - radius},${cy} A${radius},${radius} 0 ${largeArc},1 ${x},${y}" fill="none" stroke="${color}" stroke-width="18" style="transition: stroke 0.5s;"/>
    <circle cx="${x}" cy="${y}" r="10" fill="${color}" style="filter: drop-shadow(0 2px 8px #c3cfe2); transition: fill 0.5s;"/>
  `;
  scoreLabel.textContent = score ? score.toFixed(1) : '';
  scoreLabel.style.color = color;
}

// Add after main gauge rendering
function drawSubMeters(scores) {
  const subMeterContainer = document.getElementById('submeter-container');
  subMeterContainer.innerHTML = '';
  const criteria = [
    { key: 'TR', label: 'TR' },
    { key: 'CC', label: 'CC' },
    { key: 'LR', label: 'LR' },
    { key: 'GR', label: 'GR' },
  ];
  criteria.forEach(({ key, label }) => {
    const value = scores[key];
    // Color logic as main gauge
    let color = '#e74c3c'; // red
    if (value >= 6 && value < 7) color = '#f1c40f'; // yellow
    else if (value >= 7 && value < 8) color = '#1db954'; // green
    else if (value >= 8) color = '#a259ff'; // purple
    const percent = Math.max(0, Math.min(1, (value - 4.5) / (9.0 - 4.5)));
    const angle = percent * 180;
    const radius = 22;
    const cx = 28, cy = 28;
    const theta = (angle - 180) * Math.PI / 180;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    const largeArc = angle > 180 ? 1 : 0;
    const svg = `
      <svg width="56" height="32">
        <path d="M${cx - radius},${cy} A${radius},${radius} 0 1,1 ${cx + radius},${cy}" fill="none" stroke="#eee" stroke-width="7"/>
        <path d="M${cx - radius},${cy} A${radius},${radius} 0 ${largeArc},1 ${x},${y}" fill="none" stroke="${color}" stroke-width="7" style="transition: stroke 0.5s;"/>
        <circle cx="${x}" cy="${y}" r="4" fill="${color}" style="filter: drop-shadow(0 1px 2px #c3cfe2); transition: fill 0.5s;"/>
        <text x="${cx}" y="30" text-anchor="middle" font-size="11" font-weight="bold" fill="#222">${label}</text>
      </svg>
      <div class="submeter-score">${value ? value.toFixed(1) : '-'}</div>
    `;
    const div = document.createElement('div');
    div.className = 'submeter';
    div.innerHTML = svg;
    subMeterContainer.appendChild(div);
  });
}

function showCriteriaReasons(data) {
  const reasons = [
    { key: 'TR_reason', label: 'TR' },
    { key: 'CC_reason', label: 'CC' },
    { key: 'LR_reason', label: 'LR' },
    { key: 'GR_reason', label: 'GR' },
  ];
  const reasonContainer = document.getElementById('criteria-reason-container');
  reasonContainer.innerHTML = '';
  reasons.forEach(({ key, label }) => {
    if (data[key]) {
      const div = document.createElement('div');
      div.className = 'criteria-reason';
      div.innerHTML = `<b>${label}:</b> ${data[key]}`;
      reasonContainer.appendChild(div);
    }
  });
}

// Disable/enable form fields
function setFormDisabled(disabled) {
  bandSelect.disabled = disabled;
  partSelect.disabled = disabled;
  questionInput.disabled = disabled;
  imageInput.disabled = disabled;
  answerInput.disabled = disabled;
  submitBtn.disabled = disabled;
  if (disabled) {
    submitBtn.style.opacity = 0;
    submitBtn.style.pointerEvents = 'none';
    submitBtn.style.position = 'absolute';
    submitBtn.style.left = '-9999px';
  } else {
    submitBtn.style.opacity = 1;
    submitBtn.style.pointerEvents = 'auto';
    submitBtn.style.position = 'static';
    submitBtn.style.left = 'unset';
  }
}

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function updateWordCount() {
  const part = partSelect.value || '1';
  const minWords = part === '2' ? 250 : 150;
  const count = getWordCount(answerInput.value);
  wordCountDiv.textContent = `${count}/${minWords}`;
  wordCountDiv.style.color = count < minWords ? '#e74c3c' : '#1db954';
}

answerInput.addEventListener('input', updateWordCount);
partSelect.addEventListener('change', updateWordCount);
// Initialize on load
updateWordCount();

// Form submission
form.addEventListener('submit', async function(e) {
  e.preventDefault();
  const part = partSelect.value || '1';
  const minWords = part === '2' ? 250 : 150;
  const count = getWordCount(answerInput.value);
  if (count < minWords) {
    const proceed = window.confirm(`Your answer is below the recommended word count (${minWords} words). Are you sure you want to proceed?`);
    if (!proceed) {
      return;
    }
  }
  setFormDisabled(true);
  resultSection.classList.remove('hidden');
  scoreLabel.textContent = '';
  gauge.innerHTML = '';
  correctionOutput.innerHTML = '';
  modelAnswerOutput.innerHTML = '';
  exportContainer.classList.add('hidden');
  correctionOutput.innerHTML = getLoaderHTML();
  modelAnswerOutput.innerHTML = '';
  setTimeout(startLoaderTipRotation, 50); // ensure DOM is updated

  const band = bandSelect.value;
  const question = questionInput.value;
  let imageBase64 = '';
  if (imageInput.files[0]) {
    const file = imageInput.files[0];
    imageBase64 = await toBase64(file);
  }

  // Show loading animation in gauge
  scoreLabel.textContent = '...';
  gauge.innerHTML = '<circle cx="110" cy="110" r="60" fill="none" stroke="#bfc9d9" stroke-width="18" stroke-dasharray="10 10"><animate attributeName="stroke-dashoffset" values="0;100" dur="1s" repeatCount="indefinite"/></circle>';

  // Send to backend
  try {
    const res = await fetch('/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ band, part, question, answer: answerInput.value, image: imageBase64 })
    });
    const data = await res.json();
    // Animate gauge
    setTimeout(() => {
      stopLoaderTipRotation();
      drawGauge(data.score);
      drawSubMeters(data);
      showCriteriaReasons(data);
      correctionOutput.innerHTML = '<b>Correction & Guidance:</b><br>' + renderMarkdown(data.correction);
      modelAnswerOutput.innerHTML = '<b>Model Answer:</b><br>' + renderMarkdown(data.modelAnswer);
      setFormDisabled(false);
      
      // Only show export button after confirming both correction and model answer are complete and rendered
      if (data.correction && data.modelAnswer && data.correction.trim() && data.modelAnswer.trim()) {
        // Wait for DOM to be fully updated and content to be rendered
        setTimeout(() => {
          // Double-check that the content is actually in the DOM
          const correctionContent = correctionOutput.textContent || correctionOutput.innerText;
          const modelAnswerContent = modelAnswerOutput.textContent || modelAnswerOutput.innerText;
          
          if (correctionContent && modelAnswerContent && 
              correctionContent.length > 20 && modelAnswerContent.length > 20) {
            exportContainer.classList.remove('hidden');
          }
        }, 500);
      }
    }, 600);
  } catch (err) {
    stopLoaderTipRotation();
    scoreLabel.textContent = '!';
    gauge.innerHTML = '';
    correctionOutput.innerHTML = '<span style="color:#e74c3c">Error: Could not get evaluation. Please try again.</span>';
    setFormDisabled(false);
  }
});

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// PDF Export function
async function exportToPDF() {
  try {
    // Show loading state
    exportPdfBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12,4V2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2V4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4Z"/>
      </svg>
      Generating PDF...
    `;
    exportPdfBtn.disabled = true;

    // Create a temporary container for PDF content
    const pdfContainer = document.createElement('div');
    pdfContainer.style.cssText = `
      position: absolute;
      left: -9999px;
      top: -9999px;
      width: 800px;
      background: white;
      padding: 40px;
      font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
      color: #222;
      line-height: 1.6;
    `;

    // Add header
    const header = document.createElement('div');
    header.innerHTML = `
      <h1 style="color: #4b6cb7; margin: 0 0 20px 0; font-size: 28px; text-align: center;">IELTS Writing Evaluation Report</h1>
      <div style="border-bottom: 2px solid #e1e8ed; margin-bottom: 30px; padding-bottom: 15px;">
        <p style="margin: 5px 0; font-size: 14px;"><strong>Target Band:</strong> ${bandSelect.value}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Writing Part:</strong> ${partSelect.value}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
    `;
    pdfContainer.appendChild(header);

    // Add score section
    const scoreSection = document.createElement('div');
    scoreSection.innerHTML = `
      <div style="margin-bottom: 30px; text-align: center;">
        <h2 style="color: #4b6cb7; margin: 0 0 15px 0; font-size: 24px;">Overall Score: ${scoreLabel.textContent}</h2>
        <div style="display: flex; justify-content: space-around; margin: 20px 0;">
          <div style="text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: #4b6cb7;">TR</div>
            <div style="font-size: 16px;">${document.querySelector('.submeter:nth-child(1) .submeter-score')?.textContent || 'N/A'}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: #4b6cb7;">CC</div>
            <div style="font-size: 16px;">${document.querySelector('.submeter:nth-child(2) .submeter-score')?.textContent || 'N/A'}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: #4b6cb7;">LR</div>
            <div style="font-size: 16px;">${document.querySelector('.submeter:nth-child(3) .submeter-score')?.textContent || 'N/A'}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: #4b6cb7;">GR</div>
            <div style="font-size: 16px;">${document.querySelector('.submeter:nth-child(4) .submeter-score')?.textContent || 'N/A'}</div>
          </div>
        </div>
      </div>
    `;
    pdfContainer.appendChild(scoreSection);

    // Add correction section
    const correctionSection = document.createElement('div');
    correctionSection.innerHTML = `
      <div style="margin-bottom: 30px;">
        <h3 style="color: #4b6cb7; margin: 0 0 15px 0; font-size: 20px; border-bottom: 1px solid #e1e8ed; padding-bottom: 8px;">Correction & Guidance</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #4b6cb7;">
          ${correctionOutput.innerHTML.replace('<b>Correction & Guidance:</b><br>', '')}
        </div>
      </div>
    `;
    pdfContainer.appendChild(correctionSection);

    // Add model answer section
    const modelAnswerSection = document.createElement('div');
    modelAnswerSection.innerHTML = `
      <div style="margin-bottom: 30px;">
        <h3 style="color: #4b6cb7; margin: 0 0 15px 0; font-size: 20px; border-bottom: 1px solid #e1e8ed; padding-bottom: 8px;">Model Answer</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745;">
          ${modelAnswerOutput.innerHTML.replace('<b>Model Answer:</b><br>', '')}
        </div>
      </div>
    `;
    pdfContainer.appendChild(modelAnswerSection);

    // Add footer
    const footer = document.createElement('div');
    footer.innerHTML = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e1e8ed; text-align: center; color: #6a7ba2; font-size: 12px;">
        <p>Generated by IELTS Enhancer - AI-powered writing feedback</p>
      </div>
    `;
    pdfContainer.appendChild(footer);

    // Add to document temporarily
    document.body.appendChild(pdfContainer);

    // Convert to canvas
    const canvas = await html2canvas(pdfContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    // Remove temporary container
    document.body.removeChild(pdfContainer);

    // Create PDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;

    // Add first page
    pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Save PDF
    const fileName = `IELTS_Evaluation_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);

    // Reset button
    exportPdfBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
      </svg>
      Export PDF
    `;
    exportPdfBtn.disabled = false;

  } catch (error) {
    console.error('PDF export error:', error);
    alert('Failed to generate PDF. Please try again.');
    
    // Reset button
    exportPdfBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
      </svg>
      Export PDF
    `;
    exportPdfBtn.disabled = false;
  }
}

// Loader CSS (inject if not present)
if (!document.getElementById('loader-style')) {
  const style = document.createElement('style');
  style.id = 'loader-style';
  style.textContent = `
    .loader-animation { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80px; }
    .loader-animation svg { animation: loader-rotate 1s linear infinite; }
    @keyframes loader-rotate { 100% { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

// Note Card Show/Hide Logic
const showNoteBtn = document.getElementById('show-note-btn');
const hideNoteBtn = document.getElementById('hide-note-btn');
const noteCard = document.getElementById('note-card');

showNoteBtn.addEventListener('click', () => {
  noteCard.classList.remove('hidden');
  showNoteBtn.classList.add('hidden');
});

hideNoteBtn.addEventListener('click', () => {
  noteCard.classList.add('hidden');
  showNoteBtn.classList.remove('hidden');
});

// Export PDF button event listener
exportPdfBtn.addEventListener('click', exportToPDF);
