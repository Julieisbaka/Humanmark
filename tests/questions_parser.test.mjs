import test from 'node:test';
import assert from 'node:assert/strict';

import { numberStandaloneBulletLists, stripDuplicatedChoiceLines } from '../src/app/shared/questions.js';

test('stripDuplicatedChoiceLines removes duplicated labeled choices and answer-choice header', () => {
	const prompt = [
		'What is 2 + 2?',
		'Answer Choices:',
		'A. 3',
		'B) 4',
		'C - 5',
	].join('\n');
	const cleaned = stripDuplicatedChoiceLines(prompt, ['3', '4', '5']);

	assert.equal(cleaned, 'What is 2 + 2?');
});

test('stripDuplicatedChoiceLines keeps meaningful non-choice lines', () => {
	const prompt = [
		'Solve the equation and choose one answer.',
		'You may use substitution.',
		'Answer choices:',
		'1. x = 1',
		'2. x = 2',
	].join('\n');
	const cleaned = stripDuplicatedChoiceLines(prompt, ['x = 1', 'x = 2']);

	assert.ok(cleaned.includes('You may use substitution.'));
	assert.ok(!cleaned.toLowerCase().includes('answer choices'));
	assert.ok(!cleaned.includes('1. x = 1'));
	assert.ok(!cleaned.includes('2. x = 2'));
});

test('numberStandaloneBulletLists converts isolated bullet blocks to ordered lists', () => {
	const prompt = [
		'Which issues are common?',
		'',
		'- First issue',
		'- Second issue',
		'- Third issue',
	].join('\n');

	const numbered = numberStandaloneBulletLists(prompt);

	assert.ok(numbered.includes('1. First issue'));
	assert.ok(numbered.includes('2. Second issue'));
	assert.ok(numbered.includes('3. Third issue'));
});
