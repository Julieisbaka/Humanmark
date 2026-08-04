import test from 'node:test';
import assert from 'node:assert/strict';

import { renderInlineMarkdown, renderMarkdown } from '../src/app/shared/markdown.js';

const HLE_MATH_PROMPT = [
	'compute the value of',
	'$${\\Large \\displaystyle\\int\\limits_{p=0}^{\\infty}} \\left(\\frac{ 2p - e^{-p/4}+ 2p^{7} +2pe^{-p} + e^{p/4}   }{\\sqrt[2]{\\underset{  \\left\\{  \\textbf{S} \\in ',
	'    \\textbf{SPD}_{7}:\\left[ \\sum_{i=1}^{7} \\lambda_i^2(f_2(\\textbf{S})) \\right] \\leq  p^2 \\right\\}}{\\max}  4f_1(\\textbf{S})} } \\right) dp   \\\\',
	'$$',
].join('\n');

test('renderMarkdown preserves display math delimiters and content for complex HLE expression', () => {
	const html = renderMarkdown(HLE_MATH_PROMPT);

	assert.ok(html.includes('\\[') || html.includes('$$'), 'display math should remain display-style (\\[...\\] or $$...$$)');
	assert.ok(html.includes('\\leq  p^2'), 'inner display-math content should be preserved');
	assert.ok(!html.includes('\\(p^2'), 'inline math delimiters should not be injected inside display math');
});

test('renderMarkdown normalizes single-dollar block math into display math', () => {
	const html = renderMarkdown('Before\n$\n\\int_0^1 x\\,dx\n$\nAfter');

	assert.ok(html.includes('\\int_0^1 x\\,dx'));
	assert.ok(!html.includes('\\(\\int_0^1 x\\,dx\\)'));
});

test('renderMarkdown keeps trailing dollar delimiters balanced for display blocks', () => {
	const html = renderMarkdown(HLE_MATH_PROMPT);

	assert.ok(!html.includes('\\]$'), 'display math should not leak a dangling dollar delimiter');
});

test('renderInlineMarkdown does not treat numeric-only $...$ as math', () => {
	const html = renderInlineMarkdown('Cost is $100$ today.');

	assert.equal(html, 'Cost is 100 today.');
});

test('renderInlineMarkdown auto-wraps bare \\rho but not \\AA', () => {
	const html = renderInlineMarkdown('density (\\rho) is 0.05 lb/in^3 and thickness is 1000 \\AA');

	assert.ok(html.includes('\\(\\rho\\)'));
	assert.ok(!html.includes('\\(\\AA\\)'));
});

test('renderInlineMarkdown auto-wraps bare \\mathbb{R}', () => {
	const html = renderInlineMarkdown('Correct answer is \\mathbb{R}.');

	assert.ok(html.includes('\\(\\mathbb{R}\\)'));
});

test('renderInlineMarkdown does not wrap incomplete argument-required commands', () => {
	const html = renderInlineMarkdown('Velocity vector is \\vec{v} and not just \\vec.');

	assert.ok(html.includes('\\(\\vec{v}\\)'));
	assert.ok(!html.includes('\\(\\vec\\)'));
});

test('renderInlineMarkdown recognizes bare \\dfrac expressions', () => {
	const html = renderInlineMarkdown('V(\\vec{r},t) = \\dfrac{qc}{4\\pi\\epsilon_0(d c - \\vec{d}\\cdot\\vec{v})}');

	assert.ok(html.includes('\\dfrac{qc}{4\\pi\\epsilon_0(d c - \\vec{d}\\cdot\\vec{v})}'));
	assert.ok(!html.includes('\\(\\vec\\)'));
});
