import Link from "next/link";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { Avatar } from "./ui";
import { ToastProvider } from "./motion";
import { SideNav, MobileTabs, Icon } from "./Nav";
import { logout } from "@/app/actions";
import { db } from "@/lib/db";

const STUDENT_NAV = [
  ["/dashboard", "Dashboard", "grid"],
  ["/courses", "My courses", "book"],
  ["/assignments", "Assignments", "clipboard"],
  ["/projects", "Projects", "layers"],
  ["/attendance", "Attendance", "calendar"],
  ["/grades", "Grades", "cap"],
  ["/activity", "Activity", "pulse"],
  ["/profile", "Profile", "user"],
];
const TEACHER_NAV = [
  ["/dashboard", "Dashboard", "grid"],
  ["/courses", "My courses", "book"],
  ["/students", "Students", "users"],
  ["/assignments", "Assignments", "clipboard"],
  ["/projects", "Projects", "layers"],
  ["/attendance", "Attendance", "calendar"],
  ["/analytics", "Analytics", "chart"],
];

export default function Shell({ user, children }) {
  const unread = db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0").get(user.id).n;
  const links = user.role === "teacher" ? TEACHER_NAV : user.role === "student" ? STUDENT_NAV : [["/dashboard", "Dashboard", "grid"]];
  const roleLabel = user.role === "teacher" ? "Teacher" : user.role === "student" ? "Student" : "Admin";

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="side-brand">
            <Logo size={30} href="/dashboard" />
          </div>
          <SideNav links={links} />
          <div className="side-foot">
            <ThemeToggle />
            <Link href={user.role === "student" ? "/profile" : "/settings"} className="side-user">
              <Avatar name={user.full_name} size={34} img={user.avatar_url} />
              <span className="grow">
                <span className="name">{user.full_name}</span>
                <br />
                <span className="role">{roleLabel}</span>
              </span>
            </Link>
            <form action={logout}>
              <button className="nav-item" type="submit" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--muted)" }}>
                <Icon name="logout" />
                Log out
              </button>
            </form>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <div className="topbar-inner">
              <form action="/search" className="search-form" role="search">
                <input type="search" name="q" placeholder="Search courses, students, work…" aria-label="Search" autoComplete="off" />
              </form>
              <div className="topbar-actions" style={{ marginLeft: "auto" }}>
                <Link href="/notifications" className="icon-btn" aria-label={`Notifications, ${unread} unread`}>
                  <span className="bell-icon"><Icon name="bell" /></span>
                  {unread > 0 && <span className="badge pop-in">{unread > 9 ? "9+" : unread}</span>}
                </Link>
                <Link href={user.role === "student" ? "/profile" : "/settings"} aria-label="Your account" style={{ textDecoration: "none" }}>
                  <Avatar name={user.full_name} size={32} img={user.avatar_url} />
                </Link>
              </div>
            </div>
          </header>
          <main className="page">{children}</main>
        </div>
      </div>
      <MobileTabs links={links} />
    </ToastProvider>
  );
}
