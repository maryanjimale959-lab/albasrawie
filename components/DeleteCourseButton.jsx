"use client";
import { deleteCourse } from "@/app/actions";

export default function DeleteCourseButton({ courseId, courseName }) {
  return (
    <form
      action={deleteCourse}
      onSubmit={(e) => {
        if (!confirm(`Are you sure you want to permanently delete "${courseName}"? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="course_id" value={courseId} />
      <button className="btn danger sm" type="submit">
        Delete course
      </button>
    </form>
  );
}
