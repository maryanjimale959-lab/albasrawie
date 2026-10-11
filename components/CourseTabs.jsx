import Link from "next/link";
import Tabs from "./Tabs";

const TABS = [
  ["", "Overview"],
  ["assignments", "Assignments"],
  ["projects", "Projects"],
  ["materials", "Materials"],
  ["attendance", "Attendance"],
  ["grades", "Grades"],
  ["announcements", "Announcements"],
  ["members", "Members"],
];

export default function CourseTabs({ courseId, active }) {
  return <Tabs
    active={`/courses/${courseId}${active ? `/${active}` : ""}`}
    tabs={TABS.map(([seg, label]) => ({ href: `/courses/${courseId}${seg ? `/${seg}` : ""}`, label }))}
  />;
}
