# Pixcavation - Solution

## Writeup

I recommend you watch Paul Stone's conference
talk: [Black Hat USA 2013 - Pixel Perfect Timing Attacks with HTML5](https://www.youtube.com/watch?v=KcOQfYlyIqw),
which directly inspired this misc challenge. In a nutshell, Paul describes a timing attack for leaking pixel data from
cross-origin iframes, one pixel at a time. Paul then describes a method for making the attack more efficient by
exfiltrating text (rather than raw screenshots) using a "pixel-perfect" OCR. Pixcavation revolves around this same OCR
idea.

## Working code

A working solution code is implemented in the three notebooks `1_extract_glyph_matrices`,
`2_build_pixel_perfect_ocr_btree`, and `3_pixcavate`. Make sure to run the notebooks in the correct order, as they
depend on each other.

It goes without saying that you should first install what's in `requirements.txt` and update the urls in the solution
scripts to point to where your instance is running.
