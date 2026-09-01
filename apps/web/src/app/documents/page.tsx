"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileUp,
  Loader2,
  MessageCircle,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uploadDocument, type UploadResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DocItem extends UploadResult {
  uploadedAt: number;
}

const DOC_CONTEXT_KEY = "advo-doc-context";
const ACCEPTED = ".pdf,.docx,.txt";

export default function DocumentsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const result = await uploadDocument(file);
      setDocs((prev) => [{ ...result, uploadedAt: Date.now() }, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const askAbout = useCallback(
    (doc: DocItem) => {
      sessionStorage.setItem(
        DOC_CONTEXT_KEY,
        JSON.stringify({ id: doc.document_id, filename: doc.filename })
      );
      router.push("/chat");
    },
    [router]
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a contract or agreement — ADVO extracts the text and answers
          questions about it.
        </p>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload document"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/40"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Extracting text...</p>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileUp className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">
                Drop a document here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, DOCX, or TXT — processed locally on this machine
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Uploaded documents */}
      {docs.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Uploaded this session ({docs.length})
          </h2>
          {docs.map((doc) => {
            const open = openPreview === doc.document_id;
            return (
              <div
                key={doc.document_id}
                className="rounded-xl border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {doc.document_id}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {doc.text_length.toLocaleString()} characters extracted
                      </span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => askAbout(doc)} className="gap-1.5">
                    <MessageCircle className="size-3.5" />
                    Ask about this
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenPreview(open ? null : doc.document_id)}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                  />
                  {open ? "Hide" : "Show"} extracted text
                </button>
                {open && (
                  <pre className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                    {doc.preview}
                    {doc.text_length > doc.preview.length ? "\n\n…" : ""}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
