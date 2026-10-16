"use client";
import { removeStudent } from "@/app/actions";

export default function RemoveStudentButton({ courseId, studentId, studentName }) {
  return (
    <form
      action={removeStudent}
      onSubmit={(e) => {
        if (!confirm(`Remove ${studentName} from this course?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="student_id" value={studentId} />
      <button className="btn danger sm" type="submit">
        Remove
      </button>
    </form>
  );
}
