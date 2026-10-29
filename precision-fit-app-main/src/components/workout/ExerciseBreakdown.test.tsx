// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { ExerciseBreakdown, formatPrescription } from "./ExerciseBreakdown";
import type { Exercise } from "@/types/workout";

afterEach(() => {
  cleanup();
});

describe("formatPrescription helper", () => {
  it("correctly identifies count-based reps", () => {
    expect(formatPrescription("10")).toEqual({ isDuration: false, label: "10 reps" });
    expect(formatPrescription("8-12")).toEqual({ isDuration: false, label: "8-12 reps" });
    expect(formatPrescription("AMRAP")).toEqual({ isDuration: false, label: "AMRAP (Max Reps)" });
  });

  it("correctly identifies time-based duration", () => {
    expect(formatPrescription("30 mins")).toEqual({ isDuration: true, label: "30 mins" });
    expect(formatPrescription("60 sec")).toEqual({ isDuration: true, label: "60 sec" });
    expect(formatPrescription("45s")).toEqual({ isDuration: true, label: "45s" });
  });

  it("handles missing or empty values gracefully", () => {
    expect(formatPrescription(undefined)).toEqual({ isDuration: false, label: "As prescribed" });
    expect(formatPrescription("")).toEqual({ isDuration: false, label: "As prescribed" });
  });
});

describe("ExerciseBreakdown component", () => {
  const mockExercises: Exercise[] = [
    {
      name: "Barbell Bench Press",
      sets: 5,
      reps: "5",
      rest_seconds: 120,
      target_muscles: "Chest, Triceps",
      equipment: "Barbell, Flat Bench",
      instructions: "Lower bar smoothly to mid-chest then press up.",
      form_tips: "Retract scapulae and drive through feet.",
    },
    {
      name: "Child's Pose",
      sets: 2,
      reps: "60 sec",
      rest_seconds: 0,
      target_muscles: "Lower Back, Hips",
      equipment: "Mat",
      instructions: "Rest forehead on mat and stretch arms forward.",
    },
  ];

  it("renders actual exercise names, sets, repetitions, and rest intervals", () => {
    render(<ExerciseBreakdown exercises={mockExercises} />);

    expect(screen.getByText("Barbell Bench Press")).toBeDefined();
    expect(screen.getByText("Child's Pose")).toBeDefined();

    // Sets
    expect(screen.getByText("5 sets")).toBeDefined();
    expect(screen.getByText("2 sets")).toBeDefined();

    // Reps & Timed
    expect(screen.getByText("5 reps")).toBeDefined();
    expect(screen.getByText("60 sec")).toBeDefined();

    // Rest intervals
    expect(screen.getByText("120s rest")).toBeDefined();
    expect(screen.getByText("No rest interval")).toBeDefined();
  });

  it("renders instructions, form tips, equipment, and target muscles when available", () => {
    render(<ExerciseBreakdown exercises={mockExercises} />);

    expect(screen.getByText("Lower bar smoothly to mid-chest then press up.")).toBeDefined();
    expect(screen.getByText("Retract scapulae and drive through feet.")).toBeDefined();
    expect(screen.getByText("Chest, Triceps")).toBeDefined();
    expect(screen.getByText("Barbell, Flat Bench")).toBeDefined();
  });

  it("handles missing optional fields gracefully without undefined or NaN", () => {
    const minimalExercises: Exercise[] = [
      {
        name: "Simple Pushup",
        sets: 3,
        reps: "10",
        rest_seconds: 60,
      },
    ];

    const { container } = render(<ExerciseBreakdown exercises={minimalExercises} />);
    expect(screen.getByText("Simple Pushup")).toBeDefined();
    expect(screen.getByText("3 sets")).toBeDefined();
    expect(screen.getByText("10 reps")).toBeDefined();

    // Verify no undefined, null or NaN appears in output
    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toContain("NaN");
  });

  it("handles empty exercise list with a helpful fallback message", () => {
    render(<ExerciseBreakdown exercises={[]} />);
    expect(screen.getByText("No exercise details available for this workout.")).toBeDefined();
  });
});
