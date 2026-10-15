// You Do > Practice works exactly like We Do > Assignment (same settings,
// list, editor and submission rules) and differs only in its name. Server
// code that treats We Do as "assignment-style" asks isAssignmentStyle().

const subcategoryKey = (sub) => String(sub == null ? "" : sub).trim().toLowerCase().replace(/\s+/g, "_");

/** You Do > Practice. */
const isPractice = (section, subcategory) => section === "You_Do" && subcategoryKey(subcategory) === "practice";

/** We Do, or You Do > Practice. */
const isAssignmentStyle = (section, subcategory) => section === "We_Do" || isPractice(section, subcategory);

module.exports = { subcategoryKey, isPractice, isAssignmentStyle };
