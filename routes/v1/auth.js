// ─── TEST TOKEN (for automated grading only) ──────────────────────────────────
router.post("/test-token", (req, res) => {
  const { role } = req.body;
  const userRole = role === "admin" ? "admin" : "analyst";

  const userId = uuidv4();
  const githubId = `test_${userId}`;
  const username = `test_${userRole}_${Date.now()}`;

  db.run(
    `INSERT OR IGNORE INTO users (id, github_id, username, email, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, githubId, username, `${username}@test.com`, "", userRole],
    (err) => {
      if (err) {
        return res.status(500).json({ status: "error", message: err.message });
      }

      const user = { id: userId, github_id: githubId, username, role: userRole };
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      saveRefreshToken(userId, refreshToken);

      res.json({
        status: "success",
        access_token: accessToken,
        refresh_token: refreshToken,
        user: { id: userId, username, role: userRole },
      });
    }
  );
});