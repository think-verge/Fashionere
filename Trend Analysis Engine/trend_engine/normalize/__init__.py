"""Normalizers (the TIDY stage): raw content -> countable tags.

- color.py    deterministic (hex + name -> family), no LLM
- (Phase 2b)  attributes.py  LLM, vocabulary-constrained
- pipeline.py orchestration + merge/dedup
"""
