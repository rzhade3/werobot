// Tests for AI service ranking function
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rankAnswersForVote } from './ai.service';

describe('rankAnswersForVote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when no answers are provided', async () => {
    const result = await rankAnswersForVote('What is your favorite color?', [], {});
    expect(result).toBeNull();
  });

  it('should return the only answer when there is one answer', async () => {
    const answers = [{ id: 'answer-1', text: 'Blue is my favorite' }];
    const result = await rankAnswersForVote('What is your favorite color?', answers, {});
    expect(result).toBe('answer-1');
  });

  it('should return a random answer when no API config is provided', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
      { id: 'answer-3', text: 'Green' },
    ];
    
    const result = await rankAnswersForVote('What is your favorite color?', answers, {});
    expect(['answer-1', 'answer-2', 'answer-3']).toContain(result);
  });

  it('should parse AI response correctly for valid answer index', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
      { id: 'answer-3', text: 'Green' },
    ];

    // Mock fetch to return "2" (second answer)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '2' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-2');
  });

  it('should handle index 1 correctly (first answer)', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
      { id: 'answer-3', text: 'Green' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '1' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-1');
  });

  it('should handle last index correctly', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
      { id: 'answer-3', text: 'Green' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '3' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-3');
  });

  it('should fall back to first answer when AI returns invalid index (0)', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '0' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-1'); // Falls back to first answer
  });

  it('should fall back to first answer when AI returns out of bounds index', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '5' } }], // Out of bounds
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-1'); // Falls back to first answer
  });

  it('should fall back to random answer when API request fails', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'API Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(['answer-1', 'answer-2']).toContain(result);
  });

  it('should fall back to random answer when fetch throws exception', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(['answer-1', 'answer-2']).toContain(result);
  });

  it('should handle AI response with whitespace', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  2  ' } }], // Extra whitespace
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-2');
  });

  it('should fall back to first answer when AI returns non-numeric response', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'The second answer' } }], // Not a number
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await rankAnswersForVote('What is your favorite color?', answers, {
      apiKey: 'test-key',
      environment: 'development',
    });
    expect(result).toBe('answer-1'); // Falls back to first answer
  });

  it('should use correct API endpoint and headers', async () => {
    const answers = [
      { id: 'answer-1', text: 'Blue' },
      { id: 'answer-2', text: 'Red' },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '1' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await rankAnswersForVote(
      'What is your favorite color?',
      answers,
      {
        apiKey: 'my-api-key',
        endpoint: 'https://custom-endpoint.com',
        model: 'gpt-4',
        environment: 'development',
      }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom-endpoint.com',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer my-api-key',
          'Content-Type': 'application/json',
        },
      })
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.model).toBe('gpt-4');
  });
});
