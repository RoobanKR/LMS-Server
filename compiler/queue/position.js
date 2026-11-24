// A waiting job's place in its language queue, from two cheap Redis calls
// (no job data is loaded, so many students can be told their place while the
// server is busiest). BullMQ adds a job with LPUSH to <prefix>:<queue>:wait
// and its workers take jobs from the other end, so the job at list index i of
// a list of length L is number L - i in line.
//
// → { position, waiting }; position 0 = not waiting (running already, or gone).

async function queuePosition(conn, language, jobId) {
    const key = `${conn.prefix}:${language}:wait`
    const [[e1, index], [e2, length]] = await conn.commands.pipeline().lpos(key, String(jobId)).llen(key).exec()
    if (e1 || e2) throw e1 || e2
    const waiting = Number(length) || 0
    return { position: index === null || index === undefined ? 0 : waiting - Number(index), waiting }
}

module.exports = { queuePosition }
