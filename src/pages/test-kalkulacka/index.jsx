import React from "react";
import ModelUpload from "../model-upload";

/**
 * /test-kalkulacka
 * Duplikát stránky /model-upload pro interní testy napojení na Admin (Firestore/Rules/Presets atd.).
 */
export default function TestKalkulacka() {
  return (
    <div>
      <div className="mx-auto w-full max-w-7xl px-4 pt-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>TEST KALKULAČKA</strong> – duplikát <code>/model-upload</code> pro testování napojení na Admin.
        </div>
      </div>

      <ModelUpload />
    </div>
  );
}
