// ---------- EXAM DATABASE (questions + correct answers) ----------
const QUESTIONS_DATA = [
  {
    id: 1,
    text: "What is the capital of Japan?",
    options: ["Seoul", "Beijing", "Tokyo", "Bangkok"],
    correct: "Tokyo"
  },
  {
    id: 2,
    text: "Which element has the chemical symbol 'O'?",
    options: ["Gold", "Oxygen", "Osmium", "Hydrogen"],
    correct: "Oxygen"
  },
  {
    id: 3,
    text: "Who painted the Mona Lisa?",
    options: ["Van Gogh", "Picasso", "Da Vinci", "Rembrandt"],
    correct: "Da Vinci"
  },
  {
    id: 4,
    text: "What is 15 × 4?",
    options: ["45", "60", "55", "70"],
    correct: "60"
  },
  {
    id: 5,
    text: "Which is the longest river in the world?",
    options: ["Amazon", "Nile", "Yangtze", "Mississippi"],
    correct: "Nile"
  }
];

// login credentials (simple student project)
const VALID_USER = "student123";
const VALID_PASS = "exam123";

// app state
let loggedIn = false;
// store user answers: key = question id, value = selected option text (string)
let userAnswers = {};
// track if answers have been submitted
let submitted = false;

// Helper: escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Helper: render based on login state
function render() {
  const container = document.getElementById("dynamicContent");
  if (!container) return;

  if (!loggedIn) {
    container.innerHTML = getLoginHTML();
    attachLoginEvents();
  } else {
    container.innerHTML = getQuizHTML();
    attachQuizEvents();
    attachLogoutFromQuiz();
  }
}

// ---------- LOGIN UI ----------
function getLoginHTML() {
  return `
    <div class="login-card">
      <div class="info-badge">
         Student login — use <strong>student123</strong> / <strong>exam123</strong>
      </div>
      <div class="input-field">
        <label>👤 Username</label>
        <input type="text" id="loginUser" placeholder="Enter username" autocomplete="off">
      </div>
      <div class="input-field">
        <label>🔑 Password</label>
        <input type="password" id="loginPass" placeholder="Enter password">
      </div>
      <button class="btn" id="doLoginBtn"> Start Examination</button>
      <div id="loginErr" class="error-msg" style="display: none;"></div>
    </div>
  `;
}

function attachLoginEvents() {
  const loginBtn = document.getElementById("doLoginBtn");
  const userInp = document.getElementById("loginUser");
  const passInp = document.getElementById("loginPass");
  const errDiv = document.getElementById("loginErr");

  const attemptLogin = () => {
    const username = userInp ? userInp.value.trim() : "";
    const password = passInp ? passInp.value : "";
    if (username === VALID_USER && password === VALID_PASS) {
      loggedIn = true;
      userAnswers = {};   // reset answers on fresh login
      submitted = false;
      render();
    } else {
      if (errDiv) {
        errDiv.style.display = "block";
        errDiv.innerText = " Invalid . Try student123 / exam123";
      }
    }
  };

  if (loginBtn) loginBtn.addEventListener("click", attemptLogin);
  const keyHandler = (e) => { if (e.key === "Enter") attemptLogin(); };
  if (userInp) userInp.addEventListener("keypress", keyHandler);
  if (passInp) passInp.addEventListener("keypress", keyHandler);
}

// ---------- QUIZ UI (no separate review board) ----------
function getQuizHTML() {
  // build questions part with radio groups
  let questionsHtml = `<div class="quiz-container" id="questionsContainer">`;
  
  QUESTIONS_DATA.forEach((q, idx) => {
    const selectedValue = userAnswers[q.id] || "";
    // generate radio options
    let optionsHtml = "";
    q.options.forEach(opt => {
      const isChecked = (selectedValue === opt);
      const checkedAttr = isChecked ? "checked" : "";
      optionsHtml += `
        <label class="option-radio">
          <input type="radio" name="q${q.id}" value="${escapeHtml(opt)}" ${checkedAttr}>
          <span>${escapeHtml(opt)}</span>
        </label>
      `;
    });

    questionsHtml += `
      <div class="question-item" data-qid="${q.id}">
        <div class="question-header">
          <span class="q-num-badge">${idx+1}</span>
          <span class="question-title">${escapeHtml(q.text)}</span>
        </div>
        <div class="options-list" id="options-group-${q.id}">
          ${optionsHtml}
        </div>
        <div id="feedback-${q.id}" class="answer-feedback"></div>
      </div>
    `;
  });
  
  questionsHtml += `</div>`;

  // action bar with submit button and logout
  const actionHtml = `
    <div class="action-bar">
      <button class="btn" id="submitAnswersBtn"> Submit Answers & See Results</button>
      <button class="btn logout-btn" id="logoutFromQuizBtn"> Logout</button>
    </div>
    <div id="submitMessage" class="submit-message"></div>
  `;

  return questionsHtml + actionHtml;
}

// function to collect current radio selections and store in userAnswers
function collectAnswers() {
  for (let q of QUESTIONS_DATA) {
    const selectedRadio = document.querySelector(`input[name="q${q.id}"]:checked`);
    if (selectedRadio) {
      userAnswers[q.id] = selectedRadio.value;
    }
  }
}

// function to show results (correct answers for each question)
function showResults() {
  let allAnswered = true;
  let score = 0;
  
  // Check each question and show feedback
  for (let q of QUESTIONS_DATA) {
    const userAns = userAnswers[q.id];
    const correctAns = q.correct;
    const feedbackDiv = document.getElementById(`feedback-${q.id}`);
    
    if (!userAns) {
      allAnswered = false;
      if (feedbackDiv) {
        feedbackDiv.className = `answer-feedback feedback-show feedback-wrong`;
        feedbackDiv.innerHTML = `❓ You didn't answer this question. Correct answer: ${escapeHtml(correctAns)}`;
      }
    } else {
      const isCorrect = (userAns === correctAns);
      if (isCorrect) score++;
      
      if (feedbackDiv) {
        feedbackDiv.className = `answer-feedback feedback-show ${isCorrect ? 'feedback-correct' : 'feedback-wrong'}`;
        if (isCorrect) {
          feedbackDiv.innerHTML = `✅ Correct! "${escapeHtml(userAns)}" is the right answer.`;
        } else {
          feedbackDiv.innerHTML = `❌ Your answer: "${escapeHtml(userAns)}" is incorrect. Correct answer: ${escapeHtml(correctAns)}`;
        }
      }
    }
  }
  
 
}

// Submit answers and show results
function submitAndShowAnswers() {
  // First collect all current selections
  collectAnswers();
  // Then display results/feedback for each question
  showResults();
}

// attach all events for quiz interactions
function attachQuizEvents() {
  // Submit button
  const submitBtn = document.getElementById("submitAnswersBtn");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      submitAndShowAnswers();
    });
  }
  
  // Auto-save selections as user picks answers (so we don't lose data)
  for (let q of QUESTIONS_DATA) {
    const radioButtons = document.querySelectorAll(`input[name="q${q.id}"]`);
    radioButtons.forEach(radio => {
      radio.addEventListener("change", () => {
        collectAnswers();
        // Clear any previous feedback for this question when user changes answer
        const feedbackDiv = document.getElementById(`feedback-${q.id}`);
        if (feedbackDiv) {
          feedbackDiv.className = "answer-feedback";
          feedbackDiv.innerHTML = "";
        }
        // Clear submit message when user changes answers
        const messageDiv = document.getElementById("submitMessage");
        if (messageDiv) {
          messageDiv.className = "submit-message";
          messageDiv.innerHTML = "";
        }
      });
    });
  }
}

function attachLogoutFromQuiz() {
  const logoutBtn = document.getElementById("logoutFromQuizBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      loggedIn = false;
      userAnswers = {};
      submitted = false;
      render();
    });
  }
}

// initial render when page loads
document.addEventListener("DOMContentLoaded", () => {
  render();
});