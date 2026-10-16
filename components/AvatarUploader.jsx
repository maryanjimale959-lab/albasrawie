"use client";
import { useState, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { uploadAvatar } from "@/app/actions/settings";
import { Avatar } from "@/components/ui";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary sm" disabled={pending}>
      {pending ? "Uploading..." : "Save new picture"}
    </button>
  );
}

export default function AvatarUploader({ user }) {
  const [state, formAction] = useFormState(uploadAvatar, null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form action={formAction} className="avatar-uploader-card">
      {state?.error && <div className="alert error" style={{ marginBottom: "0.75rem" }}>{state.error}</div>}
      {state?.ok && <div className="alert ok" style={{ marginBottom: "0.75rem" }}>{state.ok}</div>}

      <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          {preview ? (
            <img
              src={preview}
              alt="Preview"
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid var(--brand)",
              }}
            />
          ) : (
            <Avatar name={user.full_name} size={72} img={user.avatar_url} ring />
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 600, fontSize: "0.95rem" }}>
            {preview ? "Ready to upload" : "Upload your photo"}
          </p>
          <p className="small muted" style={{ margin: "0 0 0.75rem" }}>
            Supports PNG, JPG, WebP, or GIF (max 20MB).
          </p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <label
              className="btn ghost sm"
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Choose image
              <input
                ref={fileInputRef}
                type="file"
                name="avatar"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                style={{ display: "none" }}
                required
              />
            </label>

            {preview && (
              <>
                <SubmitBtn />
                <button type="button" onClick={handleReset} className="btn ghost sm">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
