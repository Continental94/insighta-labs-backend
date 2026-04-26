const countryMap = {
  nigeria: "NG",
  kenya: "KE",
  angola: "AO",
  tanzania: "TZ",
  ghana: "GH",
  uganda: "UG",
};

function parseQuery(query) {
  query = query.toLowerCase();

  let filters = {};

  // GENDER
  if (query.includes("male")) {
    filters.gender = "male";
  }

  if (query.includes("female")) {
    filters.gender = "female";
  }

  // AGE GROUP
  if (query.includes("child")) filters.age_group = "child";
  if (query.includes("teen")) filters.age_group = "teenager";
  if (query.includes("adult")) filters.age_group = "adult";
  if (query.includes("senior")) filters.age_group = "senior";

  // YOUNG (SPECIAL RULE)
  if (query.includes("young")) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  // ABOVE AGE
  const aboveMatch = query.match(/above (\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1]);
  }

  // BELOW AGE
  const belowMatch = query.match(/below (\d+)/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1]);
  }

  // COUNTRY
  Object.keys(countryMap).forEach((country) => {
    if (query.includes(country)) {
      filters.country_id = countryMap[country];
    }
  });

  return filters;
}

module.exports = { parseQuery };