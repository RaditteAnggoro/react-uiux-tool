import { useMemo, useRef, useState } from "react";
import { boardArgs, isBoardArgName } from "../../src/engine/board-args";
import { MAX_BOARD_PROVIDERS } from "../../src/engine/board-providers";
import type { ComponentInfo, StoryPreset } from "../../src/engine/types";
import type { Key } from "./i18n";

type SavedBoard = { id: string; name: string; args: Record<string, unknown> };
const BOARD_FILE_KIND = "uiux-component-boards";
const MAX_BOARD_FILE_BYTES = 280 * 1024;

function readBoards(key: string): SavedBoard[] {
  try {
    const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.slice(0, 20).filter(item => item && typeof item.id === "string" && typeof item.name === "string")
      .map(item => ({ ...item, args: boardArgs(item.args) }));
  } catch { return []; }
}

export default function ComponentBoards({ storageKey, stories, declaredProps, providers, providerIds, changingProvider, onProviderChange, ready, tr, onApply }: {
  storageKey: string;
  stories: StoryPreset[];
  declaredProps: ComponentInfo["props"];
  providers: ComponentInfo[];
  providerIds: readonly string[];
  changingProvider: boolean;
  onProviderChange: (ids: string[]) => void;
  ready: boolean;
  tr: (key: Key) => string;
  onApply: (props: Record<string, unknown>) => void;
}) {
  const [boards, setBoards] = useState(() => readBoards(storageKey));
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("{}");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const savedBoards = useRef(boards);
  const update = (next: SavedBoard[]) => {
    savedBoards.current = next;
    setBoards(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep current boards in memory. */ }
  };
  const parse = () => {
    try { setError(""); return boardArgs(JSON.parse(text)); }
    catch { setError(tr("boardPropsError")); return null; }
  };
  const simpleFields = declaredProps.filter(prop => prop.name !== "children" && isBoardArgName(prop.name) &&
    (prop.options?.length || ["string", "number", "boolean"].includes(prop.type.trim())));
  const formArgs = useMemo(() => {
    try { return boardArgs(JSON.parse(text)); } catch { return null; }
  }, [text]);
  const setField = (name: string, value: string | number | boolean | undefined) => {
    if (!formArgs) return;
    const next = { ...formArgs };
    if (value === undefined) delete next[name];
    else next[name] = value;
    try {
      setText(JSON.stringify(boardArgs(next), null, 2));
      setApplied(false);
      setError("");
    } catch { setError(tr("boardPropsError")); }
  };
  const importBoards = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_BOARD_FILE_BYTES) throw new Error();
      const incoming = JSON.parse(await file.text());
      const existing = savedBoards.current;
      if (incoming?.kind !== BOARD_FILE_KIND || incoming.version !== 1 ||
          !Array.isArray(incoming.boards) || !incoming.boards.length || incoming.boards.length + existing.length > 20) throw new Error();
      const names = new Set(existing.map(board => board.name));
      const imported = incoming.boards.map((board: { name?: unknown; args?: unknown }) => {
        const name = typeof board?.name === "string" ? board.name.trim() : "";
        if (!name || name.length > 80 || names.has(name)) throw new Error();
        names.add(name);
        return { id: crypto.randomUUID(), name, args: boardArgs(board.args) };
      }) as SavedBoard[];
      update([...existing, ...imported]);
      setError("");
      setApplied(false);
      setSelected(imported[0]!.id);
      setName(imported[0]!.name);
      setText(JSON.stringify(imported[0]!.args, null, 2));
    } catch { setError(tr("boardFileError")); }
  };
  const exportBoards = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: BOARD_FILE_KIND, version: 1,
      boards: boards.map(({ name, args }) => ({ name, args })) }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "component-boards.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const providerSlots = providerIds.length === 0 ? [""] : providerIds.length < Math.min(MAX_BOARD_PROVIDERS, providers.length)
    ? [...providerIds, ""] : providerIds;
  return <details className="component-boards">
    <summary>{tr("componentBoards")}</summary>
    <div className="component-board-controls">
      {providers.length > 0 && <>
        {providerSlots.map((id, index) => <label key={index}>
          {index === 0 ? tr("boardProvider") : tr("boardInnerProvider").replace("{number}", String(index))}
          <select value={id} disabled={changingProvider} onChange={event => {
            const selected = event.target.value;
            const next = [...providerIds];
            if (selected) next[index] = selected;
            else if (index === 0) next.length = 0;
            else next.splice(index, 1);
            onProviderChange(next);
          }}>
            <option value="">{tr(index === 0 ? "boardAutoProvider" : "boardNoInnerProvider")}</option>
            {providers.filter(provider => provider.id === id || !providerIds.includes(provider.id))
              .map(provider => <option key={provider.id} value={provider.id}>{provider.name} · {provider.source.file}</option>)}
          </select>
        </label>)}
      </>}
      <label>{tr("boardPreset")}
        <select value={selected} onChange={event => {
          const value = event.target.value;
          setSelected(value);
          const saved = boards.find(board => board.id === value);
          const story = value.startsWith("story:") ? stories[Number(value.slice(6))] : undefined;
          setName(saved?.name ?? story?.name ?? "");
          setText(JSON.stringify(saved?.args ?? story?.args ?? {}, null, 2));
          setError("");
          setApplied(false);
        }}>
          <option value="">{tr("boardDefaultProps")}</option>
          {stories.map((story, index) => <option value={`story:${index}`} key={`${story.file}:${story.name}`}>{story.name} · {story.file}</option>)}
          {boards.map(board => <option value={board.id} key={board.id}>{board.name}</option>)}
        </select>
      </label>
      {simpleFields.length > 0 && <details className="component-board-fields">
        <summary>{tr("boardFields")}</summary>
        {formArgs ? simpleFields.map(prop => {
          const value = Object.hasOwn(formArgs, prop.name) ? formArgs[prop.name] : undefined;
          const type = prop.type.trim();
          const shown = prop.options?.length ? typeof value === "string" && prop.options.includes(value) ? value : ""
            : typeof value === type ? String(value) : "";
          const fallback = tr("boardUseDefault");
          const choices = prop.options ?? (type === "boolean" ? ["true", "false"] : null);
          return <div className="component-board-field" key={prop.name}>
            <label>{prop.name}
              {choices ? <select aria-label={prop.name} value={shown} onChange={event => {
                const choice = event.target.value;
                setField(prop.name, choice === "" ? undefined : !prop.options && type === "boolean" ? choice === "true" : choice);
              }}>
                <option value="">{fallback}</option>
                {choices.map(option => <option key={option}>{option}</option>)}
              </select> : <input type={type === "number" ? "number" : "text"} step={type === "number" ? "any" : undefined}
                key={shown} defaultValue={shown} placeholder={String(prop.defaultValue ?? "")}
                onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                onBlur={event => {
                  const input = event.currentTarget;
                  if (input.value === shown || input.validity.badInput) return;
                  setField(prop.name, type === "number" ? input.value === "" ? undefined : input.valueAsNumber : input.value);
                }} />}
            </label>
            {!choices && value !== undefined && <button type="button" className="button"
              aria-label={`${fallback} · ${prop.name}`} onClick={() => setField(prop.name, undefined)}>{fallback}</button>}
          </div>;
        }) : <p>{tr("boardPropsError")}</p>}
      </details>}
      <label>{tr("boardProps")}<textarea rows={4} value={text} maxLength={12_000} spellCheck={false}
        onChange={event => { setText(event.target.value); setApplied(false); setError(""); }} /></label>
      <label>{tr("boardNameLabel")}<input value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label>
      <div className="component-board-actions">
        <button className="button accent" disabled={!ready} onClick={() => {
          const props = parse();
          if (props) { onApply(props); setApplied(true); }
        }}>{tr("boardApplyProps")}</button>
        <button className="button" disabled={!name.trim() || (boards.length >= 20 && !boards.some(item => item.name === name.trim()))} onClick={() => {
          const args = parse();
          if (!args) return;
          const previous = boards.find(item => item.name === name.trim());
          const board = { id: previous?.id ?? crypto.randomUUID(), name: name.trim(), args };
          update(previous ? boards.map(item => item.id === previous.id ? board : item) : [...boards, board]);
          setSelected(board.id);
        }}>{tr("boardSavePreset")}</button>
        {boards.some(board => board.id === selected) && <button className="button" onClick={() => {
          update(boards.filter(board => board.id !== selected));
          setSelected("");
        }}>{tr("deleteBoard")}</button>}
      </div>
      <div className="component-board-actions">
        <button className="button" disabled={boards.length >= 20} onClick={() => importInput.current?.click()}>{tr("boardImport")}</button>
        <input type="file" hidden ref={importInput} accept=".json,application/json" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void importBoards(file);
        }} />
        <button className="button" disabled={!boards.length} onClick={exportBoards}>{tr("boardExport")}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {applied && <p role="status">{tr("boardApplied")}</p>}
    </div>
  </details>;
}
