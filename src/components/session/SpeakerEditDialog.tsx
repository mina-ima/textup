'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type SpeakerOption = {
  speakerLabel: number;
  displayName: string;
  color: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  transcriptId: string;
  currentSpeakerLabel: number;
  speakers: SpeakerOption[];
};

export function SpeakerEditDialog({
  open,
  onOpenChange,
  sessionId,
  transcriptId,
  currentSpeakerLabel,
  speakers,
}: Props) {
  const router = useRouter();
  const [selectedLabel, setSelectedLabel] = useState(currentSpeakerLabel);
  const [renameTarget, setRenameTarget] = useState('');
  const [applyAll, setApplyAll] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedLabel(currentSpeakerLabel);
      const cur = speakers.find((s) => s.speakerLabel === currentSpeakerLabel);
      setRenameTarget(cur?.displayName ?? '');
      setApplyAll(true);
    }
  }, [open, currentSpeakerLabel, speakers]);

  const selectedSpeaker = speakers.find((s) => s.speakerLabel === selectedLabel);
  const renamedChanged = selectedSpeaker
    ? renameTarget.trim() !== '' && renameTarget.trim() !== selectedSpeaker.displayName
    : false;
  const speakerChanged = selectedLabel !== currentSpeakerLabel;

  const handleSave = async () => {
    setBusy(true);
    try {
      // 1. この行の speaker を変更（必要なとき）
      if (speakerChanged) {
        const res = await fetch(
          `/api/sessions/${sessionId}/transcripts/${transcriptId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ speakerLabel: selectedLabel }),
          },
        );
        if (!res.ok) throw new Error(`話者の変更に失敗: ${res.status}`);
      }

      // 2. 話者名の一括変更（renameTarget が変わっていて applyAll のとき）
      if (renamedChanged && applyAll && selectedSpeaker) {
        const res = await fetch(`/api/sessions/${sessionId}/speakers`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            speakerLabel: selectedLabel,
            displayName: renameTarget.trim(),
            color: selectedSpeaker.color,
          }),
        });
        if (!res.ok) throw new Error(`話者名の変更に失敗: ${res.status}`);
      }

      toast.success('保存しました');
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const nothingToSave = !speakerChanged && !(renamedChanged && applyAll);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>話者の変更</DialogTitle>
          <DialogDescription>
            この行の話者を選び、必要なら話者名もまとめて変更できます
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium">この行の話者</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {speakers.map((s) => {
                const selected = s.speakerLabel === selectedLabel;
                return (
                  <button
                    key={s.speakerLabel}
                    type="button"
                    onClick={() => setSelectedLabel(s.speakerLabel)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      selected
                        ? 'text-white ring-2 ring-offset-2 ring-indigo-500'
                        : 'text-white opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: s.color }}
                  >
                    {s.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSpeaker && (
            <div>
              <label className="text-sm font-medium">
                「{selectedSpeaker.displayName}」の名前を変更
              </label>
              <Input
                className="mt-2"
                value={renameTarget}
                onChange={(e) => setRenameTarget(e.target.value)}
                placeholder="例: 田中さん"
              />
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyAll}
                  onChange={(e) => setApplyAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span>
                  この名前を同じ話者のすべての発言にまとめて適用する
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy || nothingToSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
