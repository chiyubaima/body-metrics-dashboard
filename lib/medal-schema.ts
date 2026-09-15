import { medalMetrics } from './medals.ts';

export const medalRuleSchema = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        match: { type: 'string', enum: ['all', 'any'] },
        period: { type: 'string', enum: ['total', 'day', 'week'] },
        consecutive: { type: 'boolean' },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              metric: {
                type: 'string',
                enum: Object.keys(medalMetrics).filter(
                  (m) => m !== 'conditions' && !m.startsWith('manual'),
                ),
              },
              target: { type: 'number' },
              trainingType: {
                type: 'string',
                enum: ['all', 'resistance', 'cardio'],
              },
              activityIds: { type: 'array', items: { type: 'string' } },
              exerciseId: { type: 'string' },
              minReps: { type: 'integer' },
            },
            required: [
              'metric',
              'target',
              'trainingType',
              'activityIds',
              'exerciseId',
              'minReps',
            ],
          },
        },
      },
      required: ['match', 'period', 'consecutive', 'conditions'],
    },
  ],
};

export const medalOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string', enum: ['ready', 'clarify', 'unsupported'] },
    message: { type: 'string' },
    definition: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            rule: medalRuleSchema,
            name: { type: 'string' },
            goal: { type: 'string' },
            metric: { type: 'string', enum: Object.keys(medalMetrics) },
            thresholds: { type: 'array', items: { type: 'number' } },
            unit: { type: 'string' },
            category: {
              type: 'string',
              enum: ['body', 'diet', 'training', 'life'],
            },
            trainingType: {
              type: 'string',
              enum: ['all', 'resistance', 'cardio'],
            },
            activityIds: { type: 'array', items: { type: 'string' } },
            exerciseId: { type: 'string' },
            minReps: { type: 'integer' },
            includeHistory: { type: 'boolean' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            subject: { type: 'string' },
            motif: {
              type: 'string',
              enum: ['whale', 'mountain', 'lighthouse'],
            },
          },
          required: [
            'rule',
            'name',
            'goal',
            'metric',
            'thresholds',
            'unit',
            'category',
            'trainingType',
            'activityIds',
            'exerciseId',
            'minReps',
            'includeHistory',
            'startDate',
            'endDate',
            'subject',
            'motif',
          ],
        },
      ],
    },
  },
  required: ['outcome', 'message', 'definition'],
};
