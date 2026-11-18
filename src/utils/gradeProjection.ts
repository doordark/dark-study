import type { GradeRecord, GradeRule } from "@/types";
import { calcGradeStats, deriveGpa, detectScoreType, numericScoreToGpa } from "@/utils/grades";

export interface ProjectionCourse {
  id: number;
  credit: string;
  score: string;
  type: string;
}

export function projectGrades(grades: GradeRecord[], rule: GradeRule | undefined, courses: ProjectionCourse[], goal: number | undefined, solveFor: number | null) {
  const used = new Set([...grades.map(row => row.id), ...(rule?.excludedCourseIds ?? [])]);
  const prepared = courses.map(course => {
    let id = `projection-${course.id}`;
    while (used.has(id)) id += "-";
    used.add(id);
    const credit = Number(course.credit);
    const score = course.score.trim();
    const scoreType = detectScoreType(score);
    const gpa = scoreType === "numeric" && (Number(score) < 0 || Number(score) > 100) ? null : deriveGpa(scoreType, score);
    const validCredit = Number.isFinite(credit) && credit > 0 && credit <= 100;
    const excluded = rule?.excludedTypes.includes(course.type) ?? false;
    const row: GradeRecord = {
      id, name: "试算课程", credit: validCredit ? credit : null, gpa, score, scoreType, type: course.type,
      yearId: grades[0]?.yearId ?? "", semester: grades[0]?.semester ?? "fall",
    };
    return { key: course.id, row, validCredit, excluded };
  });
  const included = prepared.filter(entry => !entry.excluded);
  const valid = (entry: typeof prepared[number]) => entry.validCredit && entry.row.gpa !== null;
  const actual = calcGradeStats(rule, grades);
  const projection = included.length && included.every(valid)
    ? calcGradeStats(rule, [...grades, ...included.map(entry => entry.row)])
    : undefined;
  const selected = included.find(entry => entry.key === solveFor);
  const fixed = included.filter(entry => entry !== selected);
  let requiredScore: number | null | undefined;
  if (goal !== undefined && Number.isFinite(goal) && goal >= 0 && goal <= 5 && selected?.validCredit && fixed.every(valid)) {
    const base = [...grades, ...fixed.map(entry => entry.row)];
    const reaches = (score: number) => {
      const result = calcGradeStats(rule, [...base, { ...selected.row, gpa: numericScoreToGpa(score) }]).value;
      return result !== null && result + 1e-10 >= goal;
    };
    if (!reaches(100)) requiredScore = null;
    else {
      let min = 0;
      let max = 100;
      while (min < max) {
        const mid = Math.floor((min + max) / 2);
        if (reaches(mid)) max = mid;
        else min = mid + 1;
      }
      requiredScore = min;
    }
  }
  return { actual, projection, prepared, requiredScore };
}
