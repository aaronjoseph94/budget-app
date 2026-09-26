/**
 * format.test.ts's cases, run again in the DOM project (N85).
 *
 * format.ts is loaded by both test projects, and the two report its
 * branches from different file maps: 135 in the node project, 111 in the
 * DOM one. When coverage merges them, which map survives depends on which
 * process reports first, and on the DOM's alone the file read 67.85%
 * against its 75% floor, turning the gate RED at random. Running its own
 * tests in both projects covers it on either map, so the result no longer
 * depends on that order. Importing the file registers its tests here.
 */
import './format.test.js'
