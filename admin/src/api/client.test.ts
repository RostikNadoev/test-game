import { describe, expect, it } from 'vitest'
import { ApiError } from './client'

describe('ApiError', () => {
  it('stores status and message', () => {
    const err = new ApiError(401, 'invalid credentials')
    expect(err.status).toBe(401)
    expect(err.message).toBe('invalid credentials')
  })
})
