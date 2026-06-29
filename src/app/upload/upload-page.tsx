"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Container from "@/components/ui/container";
import {
  uploadFree,
  uploadPaid,
  estimateCost,
  isFreeUpload,
  FREE_UPLOAD_LIMIT,
} from "@/lib/upload/turbo-upload";
import type { UploadMetadata } from "@/lib/upload/turbo-upload";
import type { TurboUploadDataItemResponse } from "@ardrive/turbo-sdk";
import { cn } from "@/lib/utils";
import {
  UploadCloud,
  Check,
  X,
  Wallet,
  Link,
  FileUp,
  Clipboard,
} from "lucide-react";

const TYPES = ["Image", "Video", "Audio", "3D", "Working Files"] as const;

type Step = "form" | "uploading" | "success" | "error";

export default function UploadPage() {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<string>("Image");
  const [filetype, setFiletype] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [ens, setEns] = useState("");
  const [arweaveId, setArweaveId] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; slug: string; url: string; arweaveUrl: string } | null>(null);
  const [costEstimate, setCostEstimate] = useState<{ usdc: string; usd: string } | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const needsPayment = file && !isFreeUpload(file);

  useEffect(() => {
    if (needsPayment && file) {
      estimateCost(file.size)
        .then((c) => setCostEstimate({ usdc: c.usdc, usd: c.usd }))
        .catch(() => setCostEstimate(null));
    } else {
      setCostEstimate(null);
    }
  }, [file, needsPayment]);

  const handleFileDrop = useCallback((fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    setFile(f);
    setError("");
    setPreview(null);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    }
    if (!filetype) {
      const ext = f.name.split(".").pop()?.toUpperCase() ?? "";
      setFiletype(ext);
    }
  }, [filetype]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFileDrop(e.dataTransfer.files);
  }, [handleFileDrop]);

  const connectInjected = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("No wallet found. Please install MetaMask or use WalletConnect.");
    }
    setConnecting(true);
    try {
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      return signer;
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWalletConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!wcProjectId) {
        throw new Error("WalletConnect project ID not configured.");
      }
      const wc = await EthereumProvider.init({
        projectId: wcProjectId,
        chains: [8453],
        optionalChains: [1, 137],
        showQrModal: true,
        methods: ["eth_sendTransaction", "personal_sign"],
        events: ["chainChanged", "accountsChanged"],
        metadata: {
          name: "CC0-LIB",
          description: "Upload CC0 assets to the library",
          url: "https://cc0-lib.xyz",
          icons: ["https://cc0-lib.xyz/miniapp-icon.png"],
        },
      });
      await wc.connect();
      const { BrowserProvider } = await import("ethers");
      const provider = new BrowserProvider(wc);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      return signer;
    } finally {
      setConnecting(false);
    }
  }, []);

  function parseUploadError(err: unknown): string {
    if (!(err instanceof Error)) return "Upload failed";
    const msg = err.message ?? "";
    if (msg.includes("transfer amount exceeds balance") || msg.includes("insufficient funds")) {
      return "You're too poor, add cash to your wallet and try again!";
    }
    if (msg.includes("user rejected") || msg.includes("User denied") || msg.includes("ACTION_REJECTED")) {
      return "Transaction was cancelled. You can try again when ready.";
    }
    if (msg.includes("Server configuration error")) {
      return "Server not configured. Make sure GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO are set.";
    }
    return msg || "Upload failed";
  }

  const handleSubmit = useCallback(async () => {
    setError("");
    setStep("uploading");
    setProgress(0);

    try {
      let txId: string;

      if (mode === "paste") {
        if (!arweaveId || arweaveId.length !== 43) {
          throw new Error("Invalid Arweave transaction ID");
        }
        txId = arweaveId;
      } else {
        if (!file) throw new Error("No file selected");

        const metadata: UploadMetadata = {
          title,
          description,
          type: itemType,
          filetype,
          tags: tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          ens: ens || undefined,
        };

        let uploadResult: TurboUploadDataItemResponse;

        const hasInjected = typeof window !== "undefined" && !!window.ethereum;
        const signer = hasInjected
          ? await connectInjected()
          : await connectWalletConnect();

        const cachedSigner = signer;
        const walletAdapter = { getSigner: () => cachedSigner };

        if (isFreeUpload(file)) {
          uploadResult = await uploadFree(file, metadata, walletAdapter as any);
        } else {
          uploadResult = await uploadPaid(file, metadata, walletAdapter as any);
        }

        txId = uploadResult.id;
        setProgress(50);
      }

      if (!title || !description || !itemType || !filetype) {
        throw new Error("Please fill in all required fields");
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arweaveId: txId,
          title,
          description,
          type: itemType,
          filetype: filetype || "UNKNOWN",
          tags: tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          ens: ens || undefined,
          filename: file?.name,
        }),
      });

      setProgress(90);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Submit failed (${res.status})`);
      }

      const rawBody = await res.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error(
          `Submit returned an unreadable response (status ${res.status})`
        );
      }
      const arweaveUrl = `https://arweave.net/${txId}`;
      setResult({ ...data, arweaveUrl });
      setStep("success");
    } catch (err) {
      setError(parseUploadError(err));
      setStep("error");
    }
  }, [mode, file, title, description, itemType, filetype, tagsInput, ens, arweaveId, connectInjected, connectWalletConnect]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (step === "success" && result) {
    return (
      <Container>
        <div className="duration-250 peer flex w-full flex-col items-center gap-8 bg-transparent px-4 py-16 text-prim drop-shadow-md transition-all ease-linear sm:px-16 sm:py-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
            <Check className="h-10 w-10 text-green-400" />
          </div>
          <span className="font-rubik text-4xl sm:text-6xl">uploaded</span>
          <span className="max-w-md text-center text-lg text-white">
            Your file is permanently stored on Arweave. It&apos;ll appear on the
            site in about a minute.
          </span>
          <a
            href={result.arweaveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-prim px-6 py-3 font-rubik text-lg text-zinc-900 hover:bg-sec transition-colors"
          >
            View on Arweave
          </a>
          <div className="flex flex-col items-center gap-1">
            <a
              href={result.url}
              className="rounded-lg bg-zinc-800 px-6 py-3 font-rubik text-lg text-white hover:bg-zinc-700 transition-colors"
            >
              View on site
            </a>
            <span className="text-xs text-zinc-500">
              may take ~60s to go live
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(result.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-6 py-3 text-white hover:bg-zinc-700 transition-colors"
          >
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            onClick={() => {
              setStep("form");
              setFile(null);
              setPreview(null);
              setTitle("");
              setDescription("");
              setTagsInput("");
              setEns("");
              setArweaveId("");
              setResult(null);
              setWalletAddress(null);
            }}
            className="text-zinc-400 hover:text-white underline mt-4"
          >
            Upload another
          </button>
        </div>
      </Container>
    );
  }

  if (step === "error") {
    return (
      <Container>
        <div className="duration-250 peer flex w-full flex-col items-center gap-8 bg-transparent px-4 py-16 text-prim drop-shadow-md transition-all ease-linear sm:px-16 sm:py-24">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
            <X className="h-10 w-10 text-red-400" />
          </div>
          <span className="font-rubik text-4xl sm:text-6xl">error</span>
          <span className="max-w-md text-center text-white">{error}</span>
          <button
            onClick={() => setStep("form")}
            className="rounded-lg bg-zinc-800 px-6 py-3 font-rubik text-lg text-white hover:bg-zinc-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="duration-250 peer flex w-full flex-col gap-8 bg-transparent px-4 py-16 text-prim drop-shadow-md transition-all ease-linear sm:px-16">
        <span className="font-rubik text-4xl sm:text-6xl">upload</span>

        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("file")}
            className={cn(
              "rounded-lg px-4 py-2 font-rubik text-sm transition-colors",
              mode === "file"
                ? "bg-prim text-zinc-900"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            <FileUp className="mr-2 inline-block h-4 w-4" />
            Upload file
          </button>
          <button
            onClick={() => setMode("paste")}
            className={cn(
              "rounded-lg px-4 py-2 font-rubik text-sm transition-colors",
              mode === "paste"
                ? "bg-prim text-zinc-900"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            )}
          >
            <Link className="mr-2 inline-block h-4 w-4" />
            Paste Arweave ID
          </button>
        </div>

        {mode === "file" && (
          <>
            {/* Drop zone */}
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors",
                dragging
                  ? "border-prim bg-prim/5"
                  : file
                    ? "border-green-500/50 bg-green-500/5"
                    : "border-zinc-700 bg-zinc-800/30 hover:border-zinc-500"
              )}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 max-w-full rounded-lg object-contain"
                />
              ) : (
                <UploadCloud
                  className={cn(
                    "h-16 w-16",
                    dragging ? "text-prim" : "text-zinc-600"
                  )}
                />
              )}
              <span className="font-rubik text-lg text-white">
                {file ? file.name : "Drop your file here"}
              </span>
              {file && (
                <span className="text-sm text-zinc-400">
                  {formatSize(file.size)}
                  {isFreeUpload(file) ? (
                    <span className="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                      Free
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full bg-prim/20 px-2 py-0.5 text-xs text-prim">
                      Paid
                    </span>
                  )}
                </span>
              )}
              <label className="cursor-pointer rounded-lg bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 transition-colors">
                Browse files
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFileDrop(e.target.files)}
                />
              </label>
              {file && (
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Wallet + cost info */}
            {file && (
              <div className="rounded-xl bg-zinc-800/50 p-4">
                {isFreeUpload(file) ? (
                  <p className="text-sm text-zinc-400">
                    Free upload — you&apos;ll sign a message with your wallet to
                    store it on Arweave (no cost, no gas).
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Files over {formatSize(FREE_UPLOAD_LIMIT)} require payment.
                    {costEstimate && (
                      <span className="ml-1 text-white">
                        Estimated: {costEstimate.usdc} (USDC on Base)
                        <span className="text-zinc-500 ml-1">~${costEstimate.usd} USD</span>
                      </span>
                    )}
                  </p>
                )}
                {!walletAddress && (
                  <div className="mt-3 flex gap-2">
                    {typeof window !== "undefined" && window.ethereum && (
                      <button
                        onClick={connectInjected}
                        disabled={connecting}
                        className="flex items-center gap-2 rounded-lg bg-prim px-4 py-2 font-rubik text-sm text-zinc-900 hover:bg-sec transition-colors disabled:opacity-50"
                      >
                        <Wallet className="h-4 w-4" />
                        {connecting ? "Connecting..." : "Connect wallet"}
                      </button>
                    )}
                    <button
                      onClick={connectWalletConnect}
                      disabled={connecting}
                      className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 font-rubik text-sm text-white hover:bg-zinc-600 transition-colors disabled:opacity-50"
                    >
                      <Wallet className="h-4 w-4" />
                      {connecting ? "Connecting..." : "WalletConnect"}
                    </button>
                  </div>
                )}
                {walletAddress && (
                  <p className="mt-2 text-xs text-green-400">
                    Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {mode === "paste" && (
          <input
            value={arweaveId}
            onChange={(e) => setArweaveId(e.target.value)}
            placeholder="Paste Arweave transaction ID (43 chars)..."
            className="w-full rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
          />
        )}

        {/* Metadata form */}
        {(file || mode === "paste") && (
          <div className="flex flex-col gap-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 50))}
              placeholder="Title (required, 3-50 chars)"
              className="w-full rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
              maxLength={50}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              placeholder="Description (required, 3-300 chars)"
              rows={3}
              className="w-full resize-none rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
              maxLength={300}
            />
            <div className="flex gap-4 flex-wrap">
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white focus:outline-none focus:ring-2 focus:ring-prim"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={filetype}
                onChange={(e) => setFiletype(e.target.value.slice(0, 20))}
                placeholder="Filetype (e.g. PNG)"
                className="flex-1 min-w-[150px] rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
                maxLength={20}
              />
            </div>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Tags (comma separated, e.g. cc0,design,nouns)"
              className="w-full rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
            />
            <input
              value={ens}
              onChange={(e) => setEns(e.target.value)}
              placeholder="ENS name (optional, e.g. user.eth)"
              className="w-full rounded-lg bg-zinc-800 bg-opacity-50 px-4 py-3 font-spline text-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-prim"
            />
          </div>
        )}

        {/* Submit button */}
        {(file || (mode === "paste" && arweaveId)) && (
          <div className="flex flex-col gap-3">
            {file && !walletAddress && (
              <span className="text-sm text-amber-400">
                Connect wallet to upload
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={
                step === "uploading" ||
                (!!file && !walletAddress) ||
                !title ||
                !description ||
                !filetype
              }
              className="flex items-center justify-center gap-2 rounded-lg bg-prim px-8 py-4 font-rubik text-lg text-zinc-900 hover:bg-sec transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="h-5 w-5" />
              {step === "uploading"
                ? `Uploading... ${progress}%`
                : mode === "paste"
                  ? "Submit"
                  : needsPayment
                    ? "Pay & upload"
                    : "Sign & upload"}
            </button>

            {step === "uploading" && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-prim transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
