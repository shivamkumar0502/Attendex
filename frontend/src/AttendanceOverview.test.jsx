import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AttendanceOverview from "./AttendanceOverview.jsx";

describe("AttendanceOverview", () => {
  it("summarizes confirmed attendance, pending reviews and live sessions", () => {
    const classes = [
      {
        id: "class-1",
        name: "Computer Science",
        section: "Year 2 · A",
        studentCount: 2,
        lessons: [
          { id: "closed-1", active: false, created: 1_800_000_000 },
          { id: "active-1", active: true, created: 1_800_000_100 },
        ],
        attendance: [
          { lesson: "closed-1", student: "student-1", status: "present" },
          { lesson: "closed-1", student: "student-2", status: "pending" },
          { lesson: "active-1", student: "student-1", status: "pending" },
        ],
      },
    ];

    render(<AttendanceOverview classes={classes} />);

    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("1", { selector: ".overview-metric strong" })).toBeTruthy();
    expect(screen.getByText("2", { selector: ".overview-metric strong" })).toBeTruthy();
    expect(screen.getByText("Computer Science")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Confirmed attendance rate" }).getAttribute("aria-valuenow")).toBe("50");
  });

  it("shows an empty state when no classes have closed sessions", () => {
    render(<AttendanceOverview classes={[]} />);

    expect(screen.getByText("No closed sessions yet")).toBeTruthy();
    expect(screen.getByText("Your activity will appear here")).toBeTruthy();
    expect(screen.getByText("Not available")).toBeTruthy();
  });
});
