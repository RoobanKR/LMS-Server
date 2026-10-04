// Test/demo WD1 submissions through existing REST APIs only. No DB access.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const API = process.env.API_URL || 'http://localhost:5533';
const COURSE_ID = '6abb2a4ef3e28c8c78bb26bb';
const TITLE = 'WD1 - Control Flow Practice (Auto Test Cases)';
const SEED_PASSWORD = 'Changeme@123'; // Existing seedCourseEnrolments demo credential.
const reportPath = path.join(os.tmpdir(), 'wd1-demo-api-report.json');

async function call(method, route, token, body) {
  const response = await fetch(API + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`${method} ${route}: HTTP ${response.status}, non-JSON response`); }
  if (!response.ok) {
    const error = new Error(`${method} ${route}: HTTP ${response.status} ${data.message || data.error || ''}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
async function login(email, password) {
  const response = await call('POST', '/user/login', null, { email, password });
  if (!response.token) throw new Error('Login returned no token');
  return response.token;
}
function demoCode(title) {
  const bodies = {
    'Sign and Parity Checker': 'long n=s.nextLong(); if(n==0) System.out.println("Zero"); else System.out.println((n>0?"Positive":"Negative")+" "+(n%2==0?"Even":"Odd"));',
    'Leap Year Check': 'long y=s.nextLong(); System.out.println(y%400==0 || (y%4==0 && y%100!=0)?"Leap Year":"Not a Leap Year");',
    'Simple Integer Calculator': `BigInteger a=s.nextBigInteger(); String op=s.next(); BigInteger b=s.nextBigInteger();
      if((op.equals("/")||op.equals("%")) && b.signum()==0){System.out.println("Division by zero");return;}
      switch(op){case "+":System.out.println(a.add(b));break;case "-":System.out.println(a.subtract(b));break;case "*":System.out.println(a.multiply(b));break;case "/":System.out.println(a.divide(b));break;case "%":System.out.println(a.remainder(b));break;default:System.out.println("Invalid operator");}`,
    'Armstrong Number Check': `BigInteger n=s.nextBigInteger(); if(n.signum()<0){System.out.println("Not Armstrong");return;}
      String digits=n.toString(); BigInteger sum=BigInteger.ZERO; for(char digit:digits.toCharArray())sum=sum.add(BigInteger.valueOf(digit-'0').pow(digits.length()));
      System.out.println(sum.equals(n)?"Armstrong":"Not Armstrong");`,
    'Multiples of A or B in a Range': `BigInteger l=s.nextBigInteger(),r=s.nextBigInteger(),a=s.nextBigInteger().abs(),b=s.nextBigInteger().abs();
      BigInteger lcm=a.divide(a.gcd(b)).multiply(b),lo=l.subtract(BigInteger.ONE);
      BigInteger count=r.divide(a).subtract(lo.divide(a)).add(r.divide(b).subtract(lo.divide(b))).subtract(r.divide(lcm).subtract(lo.divide(lcm)));
      System.out.println(count);`,
  };
  if (!bodies[title]) throw new Error(`Unknown question: ${title}`);
  return `// TEST/DEMO submission generated for WD1 API verification.\nimport java.util.Scanner;\nimport java.math.BigInteger;\npublic class Main { public static void main(String[] args) { Scanner s=new Scanner(System.in); ${bodies[title]} } }`;
}
function findExercise(tree) {
  const matches = [];
  function walk(value, type) {
    if (!value || typeof value !== 'object') return;
    if (value.pedagogy) {
      for (const [category, groups] of Object.entries(value.pedagogy)) {
        if (!groups || typeof groups !== 'object') continue;
        for (const [subcategory, exercises] of Object.entries(groups)) {
          if (!Array.isArray(exercises)) continue;
          for (const exercise of exercises) {
            if (exercise.exerciseInformation?.exerciseName === TITLE) matches.push({
              nodeId: value._id, nodeName: value.title || value.name || value.topicName || '',
              nodeType: type, category, subcategory, exercise,
            });
          }
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childType = ({ modules: 'module', subModules: 'submodule', topics: 'topic', subTopics: 'subtopic' })[key] || type;
      if (Array.isArray(child)) child.forEach((item) => walk(item, childType));
      else if (child && typeof child === 'object') walk(child, childType);
    }
  }
  walk(tree, 'course');
  if (matches.length !== 1) throw new Error(`Expected exactly one WD1 exercise; found ${matches.length}`);
  return matches[0];
}

async function main() {
  const token = await login('priya.venkatesh.trainer@kiot-demo.test', SEED_PASSWORD);
  const response = await call('GET', `/getAll/courses-data/${COURSE_ID}`, token);
  const course = response.data;
  const context = findExercise(course);
  const students = new Map();
  for (const batch of course.batchAndParticipants || []) for (const enrollment of batch.users || []) {
    const user = enrollment.user;
    if (user?.role?.roleValue === 'student' && !['suspended', 'dropped'].includes(enrollment.status)) students.set(String(user._id), { id: String(user._id), email: user.email });
  }
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify({ course: course.courseName, students: students.size,
      context: { ...context, exercise: undefined }, evaluation: context.exercise.evaluationMethod,
      questions: context.exercise.questions.map((q) => ({ id: q._id, title: q.title, description: q.programmingQuestionDescription, sampleInput: q.sampleInput, sampleOutput: q.sampleOutput, score: q.score, functionName: q.functionName, testCases: q.testCases })),
    }, null, 2));
    return;
  }
  const questions = context.exercise.questions;
  if (context.exercise.evaluationMethod?.method !== 'testcase' || questions.length !== 5 ||
      questions.some((question) => !question.testCases?.length)) throw new Error('WD1 grading configuration changed');
  const codes = questions.map((question) => demoCode(question.title));
  // Run the real existing judge API before writing any student answers.
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    const verdict = await call('POST', '/api/run/judge', token, {
      language: 'java', files: [{ name: 'Main.java', path: 'Main.java', content: codes[index], isEntryPoint: true }],
      testCases: question.testCases, maxMarks: question.score || 10,
    });
    console.log(`Preflight: ${question.title}: ${verdict.passed}/${verdict.total}, ${verdict.score}/${verdict.maxMarks}`);
    if (verdict.passed !== question.testCases.length || verdict.total !== question.testCases.length) {
      console.log(JSON.stringify({ cases: verdict.perCase, log: verdict.log }));
      throw new Error('Judge preflight failed; no student submissions were written');
    }
  }
  if (!process.argv.includes('--submit')) return;
  const passwords = JSON.parse(process.env.STUDENT_PASSWORDS_JSON || '{}');
  const report = { courseId: COURSE_ID, exerciseId: context.exercise._id, title: TITLE,
    enrolledStudents: students.size, generatedAt: new Date().toISOString(), students: [] };
  const saveReport = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  for (const student of students.values()) {
    const result = { studentId: student.id, email: student.email, questions: [], status: 'pending' };
    report.students.push(result);
    const password = passwords[student.email] || (student.email.endsWith('@kiot-demo.test') ? SEED_PASSWORD : null);
    if (!password) { result.status = 'blocked: student login password required'; saveReport(); continue; }
    try {
      const studentToken = await login(student.email, password);
      for (let index = 0; index < questions.length; index++) {
        const question = questions[index];
        const params = new URLSearchParams({ courseId: COURSE_ID, exerciseId: context.exercise._id,
          questionId: question._id, category: context.category });
        let previous = null;
        try { previous = await call('GET', `/courses/answers/previous-submission?${params}`, studentToken); }
        catch (error) { if (error.status !== 404) throw error; }
        if (previous?.data?.codeAnswer && !previous.data.codeAnswer.startsWith('// TEST/DEMO')) {
          throw new Error('Existing non-demo answer found; preserved without overwriting');
        }
        // Idempotent repeat: don't add another attempt to an already saved demo answer.
        if (previous?.data?.codeAnswer === codes[index] && previous.data.score === (question.score || 10)) {
          result.questions.push({ questionId: question._id, score: previous.data.score, verified: true, alreadyPresent: true });
          continue;
        }
        const submission = await call('POST', '/courses/answers/submit', studentToken, {
          courseId: COURSE_ID, exerciseId: context.exercise._id, questionId: question._id,
          category: context.category, subcategory: context.subcategory, nodeId: context.nodeId,
          nodeType: context.nodeType, nodeName: context.nodeName, exerciseName: TITLE,
          selectedProgrammingLanguage: 'java', language: 'java', code: codes[index],
          // Zero is merely the client hint; the existing server judge supplies the actual score.
          score: 0, status: 'submitted', isTestSubmission: index === questions.length - 1,
        });
        if (submission.data?.evaluationBreakdown?.method !== 'testcase') throw new Error('Submission did not return server test-case grading');
        const persisted = await call('GET', `/courses/answers/previous-submission?${params}`, studentToken);
        if (persisted.data?.codeAnswer !== codes[index] || persisted.data?.score !== submission.data.score) throw new Error('Saved submission verification failed');
        result.questions.push({ questionId: question._id, score: persisted.data.score, verified: true,
          passed: submission.data.evaluationBreakdown.testcase.passed,
          total: submission.data.evaluationBreakdown.testcase.total,
          testSubmissions: submission.testSubmissions });
        saveReport();
        console.log(`Saved demo ${student.email}: ${index + 1}/5, score ${persisted.data.score}`);
      }
      result.status = 'complete';
      result.totalScore = result.questions.reduce((sum, question) => sum + question.score, 0);
    } catch (error) { result.status = `blocked: ${error.message}`; console.log(`${student.email}: ${result.status}`); }
    saveReport();
  }
  console.log(JSON.stringify({ enrolled: students.size, completed: report.students.filter((student) => student.status === 'complete').length,
    blocked: report.students.filter((student) => student.status !== 'complete').map((student) => ({ email: student.email, reason: student.status })), reportPath }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
