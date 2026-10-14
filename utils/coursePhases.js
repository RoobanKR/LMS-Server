// A course's phases as its service mapping configures them.
//
// A placement course runs in phases ("Phase I", "Phase II", ...), configured in
// the Service Mapping wizard on the mapping's courseConfigurations, matched to
// the course by NAME (phase ids are re-minted on read for older mappings, so
// names are the only durable handle). Modules carry their phase by name too.
//
// `hiddenPhases` are the phases the wizard's "Hide" box took off the course
// sidebars; their modules are not listed there.

const ServiceMapping = require("../models/ServiceMappingModel");

const norm = (v) => String(v ?? "").trim().toLowerCase();

/**
 * { phaseNames, hiddenPhases } for a Course-Structure document (needs
 * mappingId, courseName, and optionally batchAndParticipants). phaseNames is
 * the configured phases in order, then any other phase a batch names.
 * Never throws: a missing or unreadable mapping just means no phases known.
 */
async function coursePhaseInfo(course) {
  const phaseNames = [];
  const hiddenPhases = [];
  const add = (list, v) => {
    const n = String(v ?? "").trim();
    if (n && !list.some((x) => norm(x) === norm(n))) list.push(n);
  };
  try {
    if (course && course.mappingId) {
      const mapping = await ServiceMapping.findById(course.mappingId)
        .select("courseConfigurations")
        .lean();
      const configs = ((mapping && mapping.courseConfigurations) || []).filter((c) => c && c.phaseConfigEnabled);
      const config = configs.find((c) => norm(c.courseName) === norm(course.courseName))
        || (configs.length === 1 ? configs[0] : null);
      [...((config && config.phases) || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach((p) => {
          add(phaseNames, p && p.name);
          if (p && p.hidden) add(hiddenPhases, p.name);
        });
    }
  } catch (err) {
    console.error("coursePhaseInfo:", err.message);
  }
  ((course && course.batchAndParticipants) || []).forEach((b) => add(phaseNames, b && b.phase));
  return { phaseNames, hiddenPhases };
}

module.exports = { coursePhaseInfo };
