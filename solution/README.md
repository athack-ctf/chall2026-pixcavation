# Pixcavation - Solution

## Writeup

I recommend watching Paul Stone's talk:  
[Black Hat USA 2013 - Pixel Perfect Timing Attacks with HTML5](https://www.youtube.com/watch?v=KcOQfYlyIqw), which
inspired this challenge.

He explains a timing attack that leaks data from cross-origin iframes one pixel at a time. Since each pixel read takes
time, the goal is to read as few pixels as possible while extracting as much data as possible.

A naive approach would reconstruct a full screenshot of the rendered page, which is slow and inefficient. Instead, Paul
focuses on targeting the page's source code. Because it is rendered with a predictable, structured font, it becomes
possible to recover the underlying text using a "pixel-perfect" OCR approach.

Pixcavation puts you under similar constraints, limiting the number of pixels you can read to reveal the scripture.

## Working code

A working solution code is implemented in the three notebooks `1_extract_glyph_matrices`,
`2_build_pixel_perfect_ocr_btree`, and `3_pixcavate`. Make sure to run the notebooks in the correct order, as they
depend on each other.

It goes without saying that you should first install what's in `requirements.txt` and update the urls in the solution
scripts to point to where your instance is running.
