"use client";
import { useState } from "react";

const DATA_BY_TAB = {
  activity: {
    stats: [
      { label: "Courses", value: "8", hint: "Active enrolled" },
      { label: "Attendance", value: "94%", hint: "Audited rate" },
      { label: "Day streak", value: "12", hint: "Verified study" },
    ],
    bars: [
      { day: "Mon", val: 42, label: "4.2 hrs · 3 tasks" },
      { day: "Tue", val: 68, label: "6.8 hrs · 5 tasks" },
      { day: "Wed", val: 54, label: "5.4 hrs · 4 tasks" },
      { day: "Thu", val: 86, label: "8.6 hrs · 6 tasks" },
      { day: "Fri", val: 60, label: "6.0 hrs · 4 tasks" },
      { day: "Sat", val: 94, label: "9.4 hrs · 7 tasks" },
      { day: "Sun", val: 72, label: "7.2 hrs · 5 tasks" },
    ],
    items: [
      {
        title: "Systems Architecture",
        desc: "Milestone 3: WAL Logging Engine verified",
        time: "Just now",
        status: "verified",
      },
      {
        title: "Database Engineering",
        desc: "Session attendance audited via cryptographic QR",
        time: "2h ago",
        status: "audited",
      },
    ],
  },
  attendance: {
    stats: [
      { label: "Total Sessions", value: "32", hint: "This semester" },
      { label: "Present Rate", value: "96.8%", hint: "On-time arrival" },
      { label: "Audited Checks", value: "31", hint: "Cryptographic QR" },
    ],
    bars: [
      { day: "W1", val: 95, label: "100% Present" },
      { day: "W2", val: 90, label: "92% Present" },
      { day: "W3", val: 100, label: "100% Present" },
      { day: "W4", val: 85, label: "88% Present" },
      { day: "W5", val: 100, label: "100% Present" },
      { day: "W6", val: 92, label: "94% Present" },
      { day: "W7", val: 98, label: "98% Present" },
    ],
    items: [
      {
        title: "Room 402 Session",
        desc: "Marked present at 09:02 AM by QR token",
        time: "Today",
        status: "audited",
      },
      {
        title: "Lab A Workshop",
        desc: "Attendance confirmed and locked into SQLite WAL",
        time: "Yesterday",
        status: "verified",
      },
    ],
  },
  grades: {
    stats: [
      { label: "GPA Equivalent", value: "3.92", hint: "Weighted scale" },
      { label: "Submissions", value: "24", hint: "Graded & released" },
      { label: "Top Percentile", value: "Top 5%", hint: "Class cohort" },
    ],
    bars: [
      { day: "A1", val: 92, label: "Grade: 92/100" },
      { day: "A2", val: 98, label: "Grade: 98/100" },
      { day: "P1", val: 88, label: "Grade: 88/100" },
      { day: "A3", val: 95, label: "Grade: 95/100" },
      { day: "P2", val: 100, label: "Grade: 100/100" },
      { day: "A4", val: 94, label: "Grade: 94/100" },
      { day: "Fin", val: 96, label: "Grade: 96/100" },
    ],
    items: [
      {
        title: "Distributed Systems Project",
        desc: "Final review released with written code feedback",
        time: "1d ago",
        status: "verified",
      },
      {
        title: "Compiler Design Lab",
        desc: "Lexer & Parser assignment graded: 100/100",
        time: "3d ago",
        status: "verified",
      },
    ],
  },
};

export default function InteractivePreview() {
  const [activeTab, setActiveTab] = useState("activity");
  const [hoveredBar, setHoveredBar] = useState(null);

  const current = DATA_BY_TAB[activeTab];

  return (
    <div className="preview-window">
      {/* Window Title Bar */}
      <div className="preview-window-header">
        <div className="preview-window-dots">
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>

        <div className="preview-tabs">
          <button
            type="button"
            className={`preview-tab-btn ${activeTab === "activity" ? "active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${activeTab === "attendance" ? "active" : ""}`}
            onClick={() => setActiveTab("attendance")}
          >
            Attendance
          </button>
          <button
            type="button"
            className={`preview-tab-btn ${activeTab === "grades" ? "active" : ""}`}
            onClick={() => setActiveTab("grades")}
          >
            Grades
          </button>
        </div>

        <div className="preview-live-indicator">
          <span className="live-dot" />
          <span>Real-time</span>
        </div>
      </div>

      {/* Window Body */}
      <div className="preview-window-body">
        {/* Metric Cards Row */}
        <div className="preview-metric-row">
          {current.stats.map((s, idx) => (
            <div key={idx} className="preview-metric-card">
              <span className="metric-val">{s.value}</span>
              <span className="metric-label">{s.label}</span>
              <span className="metric-hint">{s.hint}</span>
            </div>
          ))}
        </div>

        {/* Interactive Chart Section */}
        <div className="preview-chart-wrapper">
          <div className="preview-chart-header">
            <span className="chart-title">Weekly Performance Metric</span>
            {hoveredBar !== null ? (
              <span className="chart-tooltip-badge">
                {current.bars[hoveredBar].day}: {current.bars[hoveredBar].label}
              </span>
            ) : (
              <span className="chart-tooltip-hint">Hover bars to inspect metrics</span>
            )}
          </div>

          <div className="preview-bars-container">
            {current.bars.map((bar, i) => (
              <div
                key={i}
                className="preview-bar-col"
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <div className="preview-bar-track">
                  <div
                    className={`preview-bar-fill ${hoveredBar === i ? "highlight" : ""}`}
                    style={{ height: `${bar.val}%` }}
                  />
                </div>
                <span className="preview-bar-label">{bar.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed Section */}
        <div className="preview-feed-section">
          {current.items.map((item, idx) => (
            <div key={idx} className="preview-feed-item">
              <div className="feed-status-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="feed-item-content">
                <span className="feed-title">{item.title}</span>
                <span className="feed-desc">{item.desc}</span>
              </div>
              <span className="feed-timestamp">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

