const fs = require("fs");
const path = require("path");
const db = require("../database/db");
const { v4: uuidv4 } = require("uuid");

const filePath = path.join(__dirname, "../data/profiles.json");

function seedDatabase() {
  const rawData = fs.readFileSync(filePath);

  const parsed = JSON.parse(rawData);
  const profiles = parsed.profiles || parsed;

  db.serialize(() => {
    profiles.forEach((profile) => {
      db.run(
        `INSERT OR IGNORE INTO profiles 
        (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), // 🔥 generate ID
          profile.name,
          profile.gender,
          profile.gender_probability,
          profile.age,
          profile.age_group,
          profile.country_id,
          profile.country_name,
          profile.country_probability,
          new Date().toISOString(), // 🔥 generate timestamp
        ]
      );
    });

    console.log("Seeding complete ✅");
  });
}

module.exports = seedDatabase;