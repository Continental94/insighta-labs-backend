const { v4: uuidv4 } = require("uuid");
const db = require("../database/db");

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const log = {
      id: uuidv4(),
      user_id: req.user ? req.user.id : null,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      ip: req.ip || req.connection.remoteAddress,
    };

    db.run(
      `INSERT INTO request_logs (id, user_id, method, path, status_code, ip)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [log.id, log.user_id, log.method, log.path, log.status_code, log.ip],
      (err) => {
        if (err) console.error("Logger error:", err.message);
      }
    );

    console.log(
      `[${new Date().toISOString()}] ${log.method} ${log.path} ${log.status_code} - ${Date.now() - start}ms`
    );
  });

  next();
};

module.exports = requestLogger;
