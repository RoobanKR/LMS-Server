// Match the signed-in user's usable enrollment in the SAME roster entry.
// Missing status is accepted for legacy rosters; suspended/dropped are excluded.
const enrolledCourseScope = (userId, existingScope = {}) => ({
  $and: [
    existingScope,
    { batchAndParticipants: { $elemMatch: { users: { $elemMatch: {
      user: userId,
      status: { $nin: ['suspended', 'dropped'] },
    } } } } },
  ],
});

module.exports = { enrolledCourseScope };
