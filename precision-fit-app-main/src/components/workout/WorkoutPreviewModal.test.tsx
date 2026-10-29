// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkoutPreviewModal } from "./WorkoutPreviewModal";
import type { Workout } from "@/types/workout";

afterEach(() => {
  cleanup();
});

describe("WorkoutPreviewModal component", () => {
  const mockWorkout: Workout = {
    id: "mg-adv-1",
    name: "Push Day Volume",
    category: "Strength",
    difficulty: "advanced",
    focus: "Chest · Shoulders",
    duration_minutes: 55,
    estimated_calories: 460,
    equipment: "Barbell, Bench, Dip Station",
    description: "High volume push day for maximum hypertrophy.",
    exercises: [
      {
        name: "Barbell Bench Press",
        sets: 5,
        reps: "5",
        rest_seconds: 120,
        target_muscles: "Chest, Triceps",
        equipment: "Barbell, Flat Bench",
        instructions: "Lie flat on the bench and lower bar with control.",
        form_tips: "Keep elbows tucked at 45 degrees.",
      },
      {
        name: "Weighted Dips",
        sets: 4,
        reps: "8",
        rest_seconds: 90,
        target_muscles: "Lower Chest, Triceps",
        equipment: "Dip Station",
        instructions: "Mount bars and lean forward slightly.",
      },
    ],
  };

  it("renders the exact workout name, category, difficulty, and overview statistics", () => {
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={vi.fn()}
        onStartWorkout={vi.fn()}
      />
    );

    // Workout Name
    expect(screen.getByText("Push Day Volume")).toBeDefined();
    expect(screen.getByText("High volume push day for maximum hypertrophy.")).toBeDefined();

    // Badges & Metrics
    expect(screen.getByText("Strength")).toBeDefined();
    expect(screen.getByText("Advanced")).toBeDefined();
    expect(screen.getByText("55 min")).toBeDefined();
    expect(screen.getByText("460 kcal")).toBeDefined();
    expect(screen.getAllByText("Chest · Shoulders").length).toBeGreaterThanOrEqual(1);
  });

  it("calculates and displays correct session summary metrics", () => {
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={vi.fn()}
        onStartWorkout={vi.fn()}
      />
    );

    // Total exercises = 2, Total sets = 5 + 4 = 9
    expect(screen.getByText("9 sets")).toBeDefined();
    expect(screen.getByText("2 movements")).toBeDefined();
    expect(screen.getByText("Barbell, Bench, Dip Station")).toBeDefined();
  });

  it("renders exercises through the breakdown", () => {
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={vi.fn()}
        onStartWorkout={vi.fn()}
      />
    );

    expect(screen.getByText("Barbell Bench Press")).toBeDefined();
    expect(screen.getByText("Weighted Dips")).toBeDefined();
  });

  it("calls onStartWorkout with the exact previewed workout when Start Workout is clicked", () => {
    const handleStartWorkout = vi.fn();
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={vi.fn()}
        onStartWorkout={handleStartWorkout}
      />
    );

    const startBtn = screen.getByRole("button", { name: /start workout/i });
    fireEvent.click(startBtn);

    expect(handleStartWorkout).toHaveBeenCalledTimes(1);
    expect(handleStartWorkout).toHaveBeenCalledWith(mockWorkout);
  });

  it("prevents duplicate session initialization when isStarting is true (double-click guard)", () => {
    const handleStartWorkout = vi.fn();
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={vi.fn()}
        onStartWorkout={handleStartWorkout}
        isStarting={true}
      />
    );

    // Button should be disabled and showing starting text
    expect(screen.getByText("Starting Workout...")).toBeDefined();
    const startBtn = screen.getByRole("button", { name: /starting workout/i });
    fireEvent.click(startBtn);

    expect(handleStartWorkout).not.toHaveBeenCalled();
  });

  it("calls onClose when Close Preview is clicked", () => {
    const handleClose = vi.fn();
    render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={true}
        onClose={handleClose}
        onStartWorkout={vi.fn()}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /close preview/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <WorkoutPreviewModal
        workout={mockWorkout}
        isOpen={false}
        onClose={vi.fn()}
        onStartWorkout={vi.fn()}
      />
    );

    expect(container.textContent).toBe("");
  });
});
