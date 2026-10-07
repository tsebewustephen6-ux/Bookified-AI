"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import { upload } from "@vercel/blob/client";
import { z } from "zod";
import { FileUp, ImagePlus, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { BookCover } from "./book-cover";
import { PDF_LIMIT, COVER_LIMIT } from "@/lib/validation";
import { api } from "@/lib/client-api";
const fieldsSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  author: z.string().trim().min(1, "Enter an author.").max(200),
  personaId: z.string().min(1, "Choose a voice."),
});
const admissionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  fileKey: z.string(),
  coverKey: z.string().nullish(),
});
export function UploadForm({
  catalog,
}: {
  catalog: { id: string; name: string; description: string }[];
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof fieldsSchema>>({
    resolver: zodResolver(fieldsSchema),
    defaultValues: { title: "", author: "", personaId: catalog[0]?.id || "" },
  });
  const [pdf, setPdf] = useState<File>();
  const [cover, setCover] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState<number>();
  const busy = useRef(false);
  const admission = useRef<z.infer<typeof admissionSchema> | null>(null);
  const [admitted, setAdmitted] = useState(false);
  const key = useRef<string | null>(null);
  const uploaded = useRef({ pdf: false, cover: false });
  const previewRef = useRef("");
  const [title, author] = useWatch({
    control: form.control,
    name: ["title", "author"],
  });
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  function select(file: File | undefined, purpose: "pdf" | "cover") {
    if (busy.current || admission.current) return;
    setError("");
    if (!file) return;
    const valid =
      purpose === "pdf"
        ? file.size <= PDF_LIMIT &&
          file.size > 0 &&
          (file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf"))
        : file.size <= COVER_LIMIT &&
          ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!valid) {
      setError(
        purpose === "pdf"
          ? "Choose a PDF up to 50 MiB."
          : "Choose a JPEG, PNG or WebP cover up to 10 MiB.",
      );
      return;
    }
    if (purpose === "pdf") setPdf(file);
    else {
      setCover(file);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(file);
      setPreview(previewRef.current);
    }
  }
  async function submit(fields: z.infer<typeof fieldsSchema>) {
    if (busy.current) return;
    if (!pdf) {
      setError("Choose a PDF to begin.");
      return;
    }
    busy.current = true;
    setError("");
    try {
      setStage("Reserving your book");
      key.current ||= crypto.randomUUID();
      if (!admission.current)
        admission.current = await api("/api/books", admissionSchema, {
          method: "POST",
          body: JSON.stringify({
            ...fields,
            fileSizeBytes: pdf.size,
            ...(cover
              ? { coverType: cover.type, coverSizeBytes: cover.size }
              : {}),
            idempotencyKey: key.current,
          }),
        });
      const record = admission.current;
      setAdmitted(true);
      if (!uploaded.current.pdf) {
        setStage("Uploading PDF");
        setProgress(0);
        await upload(record.fileKey, pdf, {
          access: "private",
          contentType: "application/pdf",
          handleUploadUrl: "/api/upload",
          multipart: true,
          clientPayload: JSON.stringify({ id: record.id, purpose: "pdf" }),
          onUploadProgress: (event) => setProgress(event.percentage),
        });
        uploaded.current.pdf = true;
      }
      if (cover && record.coverKey && !uploaded.current.cover) {
        setStage("Uploading cover");
        setProgress(0);
        await upload(record.coverKey, cover, {
          access: "private",
          contentType: cover.type,
          handleUploadUrl: "/api/upload",
          clientPayload: JSON.stringify({ id: record.id, purpose: "cover" }),
          onUploadProgress: (event) => setProgress(event.percentage),
        });
        uploaded.current.cover = true;
      }
      setProgress(undefined);
      setStage("Confirming uploaded files");
      // Completion is verified by Blob; retry confirmation while its callback arrives.
      let confirmed = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          await api(
            `/api/books/${record.id}/confirm`,
            z.object({ id: z.string() }),
            { method: "POST" },
          );
          confirmed = true;
          break;
        } catch (err) {
          if (attempt === 7) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      if (confirmed) router.push(`/books/${record.slug}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload interrupted. Try again; your input is preserved.",
      );
    } finally {
      busy.current = false;
      setStage("");
    }
  }
  return (
    <div className="form-grid">
      <form
        className="panel"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <fieldset
          disabled={Boolean(stage)}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="field">
            <label htmlFor="pdf">Book PDF</label>
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                select(e.dataTransfer.files[0], "pdf");
              }}
            >
              <FileUp size={28} aria-hidden />
              <span>Drop your PDF here, or choose a file</span>
              <input
                id="pdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={admitted}
                onChange={(e) => select(e.target.files?.[0], "pdf")}
              />
              <p>Readable PDFs · up to 50 MiB · OCR not included</p>
              {pdf ? (
                <span className="file-details">
                  {pdf.name} · {(pdf.size / 1048576).toFixed(1)} MiB
                </span>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label htmlFor="cover">
              Cover image <span>(optional)</span>
            </label>
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                select(e.dataTransfer.files[0], "cover");
              }}
            >
              <ImagePlus size={24} aria-hidden />
              <input
                id="cover"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={admitted}
                onChange={(e) => select(e.target.files?.[0], "cover")}
              />
              <p>Up to 10 MiB. Otherwise we use your PDF’s first page.</p>
              {cover ? (
                <span className="file-details">
                  {cover.name} · {(cover.size / 1048576).toFixed(1)} MiB
                </span>
              ) : null}
            </div>
          </div>
          {(["title", "author"] as const).map((field) => (
            <div className="field" key={field}>
              <label htmlFor={field}>
                {field === "title" ? "Book title" : "Author"}
              </label>
              <input
                id={field}
                maxLength={200}
                disabled={admitted}
                {...form.register(field)}
                aria-invalid={Boolean(form.formState.errors[field])}
                aria-describedby={
                  form.formState.errors[field] ? `${field}-error` : undefined
                }
              />
              {form.formState.errors[field] ? (
                <p id={`${field}-error`} role="alert">
                  {form.formState.errors[field]?.message}
                </p>
              ) : null}
            </div>
          ))}
          <div className="field">
            <label htmlFor="voice">Your conversation voice</label>
            <select
              id="voice"
              {...form.register("personaId")}
              disabled={admitted}
            >
              {catalog.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name} — {v.description}
                </option>
              ))}
            </select>
            {form.formState.errors.personaId ? (
              <p role="alert">{form.formState.errors.personaId.message}</p>
            ) : null}
          </div>
          {error ? (
            <p className="error-message" role="alert">
              {error}
            </p>
          ) : null}
          {stage ? (
            <div className="progress-box" role="status">
              <p>{stage}</p>
              {progress !== undefined ? (
                <progress max={100} value={progress} aria-label={stage} />
              ) : null}
            </div>
          ) : null}
          <Button type="submit" disabled={Boolean(stage) || !catalog.length}>
            {stage || (admitted ? "Resume synthesis" : "Begin synthesis")}
            <ArrowRight size={18} />
          </Button>
        </fieldset>
      </form>
      <aside className="panel preview-panel">
        <h2>A glimpse of your bookshelf</h2>
        {preview ? (
          <Image
            unoptimized
            width={245}
            height={330}
            src={preview}
            alt="Selected cover preview"
            style={{ width: "100%", maxHeight: 330, objectFit: "contain" }}
          />
        ) : (
          <BookCover
            id="preview"
            title={title || "Your next chapter"}
            author={author || "A story worth exploring"}
          />
        )}
        <p>
          Your PDF and cover stay private. Text is processed into page
          references so your conversations can return to the source.
        </p>
      </aside>
    </div>
  );
}
