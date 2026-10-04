const assert = require('node:assert/strict');
const { enrolledCourseScope } = require('./enrolledCourseScope');
const previous = { _id: { $in: ['poc-course'] } };
const result = enrolledCourseScope('signed-in-user', previous);
assert.deepEqual(result.$and[0], previous);
assert.deepEqual(result.$and[1], {
  batchAndParticipants: { $elemMatch: { users: { $elemMatch: {
    user: 'signed-in-user', status: { $nin: ['suspended', 'dropped'] },
  } } } },
});
assert.deepEqual(previous, { _id: { $in: ['poc-course'] } });
console.log('Enrollment query keeps user/status in one entry and preserves POC scope');
