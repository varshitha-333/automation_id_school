# ── Flush this batch to disk ──────────────────────────
# ── Flush this batch to disk ──────────────────────────
try:
    if first_write:
        batch_doc.save(
            out_path,
            deflate=True, deflate_images=True, deflate_fonts=True,
            garbage=4, clean=True, linear=False,
        )
        first_write = False
    else:
        # Save merged result to a temp file, then atomically replace out_path.
        # Cannot save fitz.open(out_path) back to out_path with incremental=False.
        tmp_merge = out_path + ".merge.pdf"
        try:
            existing = fitz.open(out_path)
            existing.insert_pdf(batch_doc)
            existing.save(
                tmp_merge,
                deflate=True, deflate_images=True, deflate_fonts=True,
                garbage=4, clean=True,
            )
            existing.close()
            os.replace(tmp_merge, out_path)   # atomic on POSIX
        except Exception:
            if os.path.exists(tmp_merge):
                try: os.unlink(tmp_merge)
                except: pass
            raise
finally:
    batch_doc.close()
    gc.collect()