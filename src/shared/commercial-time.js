'use strict';

const { DateTime } = require('luxon');
const { AppError } = require('./errors');

const MINUTES = { morningStart: 8 * 60, morningEnd: 12 * 60, afternoonStart: 13 * 60 + 30, afternoonEnd: 17 * 60 + 30 };

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getSaleShift(value) {
  const minutes = timeToMinutes(value);
  if (minutes !== null && minutes >= MINUTES.morningStart && minutes < MINUTES.morningEnd) return 'morning';
  if (minutes !== null && minutes >= MINUTES.afternoonStart && minutes <= MINUTES.afternoonEnd) return 'afternoon';
  throw new AppError(422, 'OUTSIDE_BUSINESS_HOURS', 'Horário fora do expediente comercial.', { sale_time: 'Use 08:00–11:59 ou 13:30–17:30.' });
}

function nowCommercial(timezone = 'America/Sao_Paulo') {
  const now = DateTime.now().setZone(timezone);
  return { date: now.toISODate(), time: now.toFormat('HH:mm') };
}

module.exports = { MINUTES, timeToMinutes, getSaleShift, nowCommercial };
