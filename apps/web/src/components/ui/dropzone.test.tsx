import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dropzone, partitionFiles } from "@/components/ui/dropzone";
import { renderWithIntl } from "@/test/render";

const pdf = (name = "a.pdf", size = 10) =>
  new File(["x".repeat(size)], name, { type: "application/pdf" });

describe("partitionFiles", () => {
  it("accepts matching files and explains rejections", () => {
    const image = new File(["img"], "b.png", { type: "image/png" });
    const empty = new File([], "c.pdf", { type: "application/pdf" });
    const big = pdf("d.pdf", 200);
    const { accepted, rejected } = partitionFiles([pdf(), image, empty, big], [".pdf"], 100);
    expect(accepted.map((file) => file.name)).toEqual(["a.pdf"]);
    expect(rejected.map((item) => item.reason)).toEqual([
      "This file type is not supported here.",
      "This file is empty.",
      "This file is larger than 100 B.",
    ]);
  });

  it("supports wildcard MIME rules", () => {
    const image = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    expect(partitionFiles([image], ["image/*"], undefined).accepted).toHaveLength(1);
  });
});

describe("Dropzone", () => {
  it("is keyboard accessible and reports picked files", async () => {
    const onFiles = vi.fn();
    renderWithIntl(<Dropzone onFiles={onFiles} accept={[".pdf"]} title="Select PDF files" />);
    const zone = screen.getByRole("button", { name: /select pdf files/i });
    expect(zone).toHaveAttribute("tabindex", "0");
    const input = zone.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, [pdf("one.pdf"), pdf("two.pdf")]);
    expect(onFiles).toHaveBeenCalledWith([
      expect.objectContaining({ name: "one.pdf" }),
      expect.objectContaining({ name: "two.pdf" }),
    ]);
  });

  it("handles dropped files and rejects unsupported ones", () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    renderWithIntl(
      <Dropzone onFiles={onFiles} onReject={onReject} accept={[".pdf"]} title="Drop here" />,
    );
    const zone = screen.getByRole("button", { name: /drop here/i });
    const text = new File(["t"], "notes.txt", { type: "text/plain" });
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf(), text] } });
    expect(zone).not.toHaveAttribute("data-dragging");
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "a.pdf" })]);
    expect(onReject).toHaveBeenCalledWith([
      expect.objectContaining({ reason: "This file type is not supported here." }),
    ]);
  });

  it("ignores input when disabled", () => {
    const onFiles = vi.fn();
    renderWithIntl(<Dropzone onFiles={onFiles} disabled title="Disabled zone" />);
    const zone = screen.getByRole("button", { name: /disabled zone/i });
    expect(zone).toHaveAttribute("aria-disabled", "true");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
