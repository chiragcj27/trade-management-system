"use client";

import { tr } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { api, getGps } from "@/lib/api";
import { useMe } from "./shell";
import { useToast } from "./providers";
import { Btn } from "./ui";

const MAX_WIDTH = 1024;

/** Photos come only from the live camera, so an old gallery picture cannot be reused. */
export function PhotoInput({ kind, label, onChange }: { kind: string; label: string; onChange: (photoId: string | null) => void }) {
  const toast = useToast();
  const { demo } = useMe();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
  };
  useEffect(() => stop, []);

  async function open() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = media;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
      });
    } catch {
      toast("bad", demo ? "No camera available here. Use a sample photo for the demo." : "Could not open the camera. Allow camera access for this app.");
    }
  }

  async function upload(dataUrl: string) {
    setSaving(true);
    try {
      const gps = await getGps().catch(() => undefined);
      const { photoId } = await api<{ photoId: string }>("/photos", { body: { kind, dataUrl, ...(gps ? { gps } : {}) } });
      setPreview(dataUrl);
      onChange(photoId);
    } catch (e) {
      toast("bad", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function snap() {
    const el = video.current;
    if (!el) return;
    const scale = Math.min(1, MAX_WIDTH / el.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth * scale;
    canvas.height = el.videoHeight * scale;
    canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
    stop();
    void upload(canvas.toDataURL("image/jpeg", 0.6));
  }

  function sample() {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 320;
    const c = canvas.getContext("2d");
    if (c) {
      c.fillStyle = "#2343A6";
      c.fillRect(0, 0, 480, 320);
      c.fillStyle = "#fff";
      c.font = "26px sans-serif";
      c.textAlign = "center";
      c.fillText(label, 240, 155);
      c.font = "16px sans-serif";
      c.fillText("Sample photo for the demo", 240, 190);
    }
    void upload(canvas.toDataURL("image/jpeg", 0.7));
  }

  function clear() {
    setPreview(null);
    onChange(null);
  }

  return (
    <div className="camera">
      <span className="small" style={{ fontWeight: 600 }}>{tr(label)}</span>
      {preview && (
        <div className="row">
          <img src={preview} alt={tr(label)} className="thumb" />
          <Btn tone="ghost" size="small" onClick={clear}>{tr("Retake")}</Btn>
        </div>
      )}
      {cameraOn && (
        <>
          <video ref={video} playsInline muted />
          <div className="row">
            <Btn onClick={snap}>{tr("Capture")}</Btn>
            <Btn tone="ghost" onClick={stop}>{tr("Cancel")}</Btn>
          </div>
        </>
      )}
      {!preview && !cameraOn && (
        <div className="row">
          <Btn tone="ghost" disabled={saving} onClick={open}>{tr("Open camera")}</Btn>
          {demo && <Btn tone="ghost" disabled={saving} onClick={sample}>{tr("Use sample photo")}</Btn>}
        </div>
      )}
    </div>
  );
}
