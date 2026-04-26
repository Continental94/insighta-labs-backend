function buildQuery(params) {
  let query = "SELECT * FROM profiles WHERE 1=1";
  let values = [];

  // FILTERS
  if (params.gender) {
    query += " AND LOWER(gender) = LOWER(?)";
    values.push(params.gender);
  }

  if (params.country_id) {
    query += " AND LOWER(country_id) = LOWER(?)";
    values.push(params.country_id);
  }

  if (params.age_group) {
    query += " AND LOWER(age_group) = LOWER(?)";
    values.push(params.age_group);
  }

  if (params.min_age) {
    query += " AND age >= ?";
    values.push(Number(params.min_age));
  }

  if (params.max_age) {
    query += " AND age <= ?";
    values.push(Number(params.max_age));
  }

  if (params.min_gender_probability) {
    query += " AND gender_probability >= ?";
    values.push(Number(params.min_gender_probability));
  }

  if (params.min_country_probability) {
    query += " AND country_probability >= ?";
    values.push(Number(params.min_country_probability));
  }

  // SORTING
  const sortFields = ["age", "created_at", "gender_probability"];
  const sortBy = sortFields.includes(params.sort_by) ? params.sort_by : "created_at";

  const order = params.order === "asc" ? "ASC" : "DESC";

  query += ` ORDER BY ${sortBy} ${order}`;

  return { query, values };
}

module.exports = { buildQuery };