import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("defaults to type button and fires clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Merge PDF</Button>);
    const button = screen.getByRole("button", { name: "Merge PDF" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders its child element with asChild", () => {
    render(
      <Button asChild variant="primary">
        <a href="https://example.com/guide">Open guide</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Open guide" });
    expect(link).toHaveAttribute("href", "https://example.com/guide");
    expect(link.className).toContain("bg-cta-gradient");
  });
});
