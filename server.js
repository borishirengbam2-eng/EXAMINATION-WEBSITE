require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const DB = 'examdb'; // ← your single database name

// ── Connect to IBM Cloudant ──────────────────
const client = new CloudantV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.CLOUDANT_APIKEY
  }),
  serviceUrl: process.env.CLOUDANT_URL,
});

// ── Create the database if it doesn't exist ──
async function initDB() {
  try {
    await client.putDatabase({ db: DB });
    console.log(`Database "${DB}" created.`);
  } catch (err) {
    if (err.status === 412) {
      console.log(`Database "${DB}" already exists.`);
    } else {
      console.error('DB init error:', err);
    }
  }
}
initDB();

// ════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ════════════════════════════════════════════
// HELPER — fetch all docs of a certain type
// ════════════════════════════════════════════
async function getDocsByType(type) {
  const result = await client.postAllDocs({
    db: DB,
    includeDocs: true,
  });
  return result.result.rows
    .map(r => r.doc)
    .filter(doc => doc.type === type);
}

// ════════════════════════════════════════════
// ROUTE — POST /api/setup
// Run ONCE to seed students + questions
// ════════════════════════════════════════════
app.post('/api/setup', async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);

    // ── Students ──────────────────────────────
    const students = [
      { _id: 'student_STU001', type: 'student', studentId: 'STU001',
        name: 'Alex Johnson',
        passwordHash: await bcrypt.hash('pass123', salt) },
      { _id: 'student_STU002', type: 'student', studentId: 'STU002',
        name: 'Maria Santos',
        passwordHash: await bcrypt.hash('pass456', salt) },
    ];

    // ── Questions ─────────────────────────────
    const questions = [
      { _id: 'question_1', type: 'question',
        q: 'What does CPU stand for?',
        options: ['Central Processing Unit','Computer Personal Unit','Central Program Utility','Core Processing Unit'],
        answer: 0 },
      { _id: 'question_2', type: 'question',
        q: 'Which is NOT a programming language?',
        options: ['Python','Java','HTML','C++'],
        answer: 2 },
      { _id: 'question_3', type: 'question',
        q: 'Output of print(2**3) in Python?',
        options: ['6','8','9','23'],
        answer: 1 },
      { _id: 'question_4', type: 'question',
        q: 'Which data structure follows LIFO?',
        options: ['Queue','Array','Stack','Linked List'],
        answer: 2 },
      { _id: 'question_5', type: 'question',
        q: 'What does RAM stand for?',
        options: ['Read Access Memory','Random Access Memory','Rapid Action Module','Runtime Array Memory'],
        answer: 1 },
      { _id: 'question_6', type: 'question',
        q: 'Which sorting algorithm has best average time complexity?',
        options: ['Bubble Sort O(n²)','Selection Sort O(n²)','Quick Sort O(n log n)','Insertion Sort O(n²)'],
        answer: 2 },
      { _id: 'question_7', type: 'question',
        q: 'How do you declare an integer in C?',
        options: ['integer x;','int x;','var x = int;','x: int;'],
        answer: 1 },
      { _id: 'question_8', type: 'question',
        q: 'Single-line comment symbol in C/C++?',
        options: ['#','//','/* */','--'],
        answer: 1 },
      { _id: 'question_9', type: 'question',
        q: 'What does OOP stand for?',
        options: ['Optimized Output Program','Object Oriented Programming','Open Output Processing','Ordered Object Program'],
        answer: 1 },
      { _id: 'question_10', type: 'question',
        q: 'Which layer of OSI model handles routing?',
        options: ['Data Link','Transport','Network','Session'],
        answer: 2 },
    ];

    // Insert all at once using bulk insert
    const allDocs = [...students, ...questions];
    await client.postBulkDocs({ db: DB, bulkDocs: { docs: allDocs } });

    res.json({ message: 'Setup complete! Added ' + students.length + ' students and ' + questions.length + ' questions.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Setup failed', details: err.message });
  }
});

// ════════════════════════════════════════════
// ROUTE — POST /api/login
// ════════════════════════════════════════════
app.post('/api/login', async (req, res) => {
  const { studentId, password } = req.body;
  if (!studentId || !password)
    return res.status(400).json({ error: 'Missing credentials' });

  try {
    // Find student doc by _id
    const result = await client.getDocument({
      db: DB,
      docId: 'student_' + studentId.toUpperCase(),
    });

    const student = result.result;
    if (student.type !== 'student')
      return res.status(401).json({ error: 'Not a student account' });

    const match = await bcrypt.compare(password, student.passwordHash);
    if (!match)
      return res.status(401).json({ error: 'Invalid password' });

    const token = jwt.sign(
      { studentId: student.studentId, name: student.name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ token, name: student.name, studentId: student.studentId });

  } catch (err) {
    if (err.status === 404)
      return res.status(401).json({ error: 'Student not found' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════
// ROUTE — GET /api/questions
// ════════════════════════════════════════════
app.get('/api/questions', authMiddleware, async (req, res) => {
  try {
    const questions = await getDocsByType('question');

    // Remove answers before sending to student
    const safe = questions.map(q => ({
      id:      q._id,
      q:       q.q,
      options: q.options,
    }));

    res.json({ questions: safe });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch questions' });
  }
});

// ════════════════════════════════════════════
// ROUTE — POST /api/submit
// Body: { answers: { "question_1": 0, "question_2": 2 } }
// ════════════════════════════════════════════
app.post('/api/submit', authMiddleware, async (req, res) => {
  const { answers } = req.body;
  const { studentId, name } = req.user;

  try {
    // Get all questions WITH answers for grading
    const questions = await getDocsByType('question');

    let correct = 0, wrong = 0, skipped = 0;
    const breakdown = [];

    questions.forEach(q => {
      const given   = answers[q._id];
      const isSkip  = given === undefined || given === -1;
      const isRight = !isSkip && parseInt(given) === q.answer;

      if (isSkip)        skipped++;
      else if (isRight)  correct++;
      else               wrong++;

      breakdown.push({
        questionId:    q._id,
        question:      q.q,
        options:       q.options,
        correctAnswer: q.answer,
        yourAnswer:    isSkip ? -1 : parseInt(given),
        isCorrect:     isRight,
      });
    });

    const total = questions.length;
    const pct   = Math.round(correct / total * 100);

    // Save result document
    await client.postDocument({
      db: DB,
      document: {
        type:        'result',
        studentId,
        name,
        score:       correct,
        total,
        percentage:  pct,
        correct,
        wrong,
        skipped,
        breakdown,
        submittedAt: new Date().toISOString(),
      },
    });

    res.json({ score: correct, total, percentage: pct, correct, wrong, skipped, breakdown });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// ════════════════════════════════════════════
// ROUTE — GET /api/results/:studentId
// ════════════════════════════════════════════
app.get('/api/results/:studentId', authMiddleware, async (req, res) => {
  const { studentId } = req.params;

  if (req.user.studentId !== studentId)
    return res.status(403).json({ error: 'Access denied' });

  try {
    const allResults = await getDocsByType('result');
    const myResults  = allResults
      .filter(r => r.studentId === studentId)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    res.json({ results: myResults });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch results' });
  }
});

// ── Start Server ─────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});