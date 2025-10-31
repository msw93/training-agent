# OpenAI Models Reference

## Official Documentation Links

### Model Availability
- **Models API Reference**: https://platform.openai.com/docs/api-reference/models
- **Models List Endpoint**: https://platform.openai.com/docs/api-reference/models/list
- **Model Release Notes**: https://help.openai.com/en/articles/9624314-model-release-notes

### Current Models (as of January 2025)

Based on research:
- **GPT-4.5**: Released February 2025 - Enhanced natural conversation and emotional intelligence
  - Check model name: `gpt-4.5` or `gpt-4.5-turbo`
  - Status: Available to Pro users and developers (research preview)
  
- **GPT-5**: Not yet officially released
  - Status: Speculated but no official API availability
  
- **GPT-4o**: Latest stable model with JSON mode support
  - Model name: `gpt-4o`
  - Best for structured outputs

- **GPT-4 Turbo**: Fast, cost-effective
  - Model name: `gpt-4-turbo-preview` or `gpt-4-1106-preview`

- **GPT-4o-mini**: Current default in code
  - Model name: `gpt-4o-mini`
  - Fastest, most cost-effective but weaker constraint handling

## To Verify Current Models

1. **Check your API account**: https://platform.openai.com/account/usage
2. **List available models**:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" | jq '.data[].id' | grep gpt
   ```
3. **Official Docs**: https://platform.openai.com/docs/models

## JSON Mode Documentation

- **JSON Mode Guide**: https://platform.openai.com/docs/guides/structured-outputs
- **Response Format Parameter**: Use `response_format: { type: "json_object" }`

## Recommendations for This Project

1. **Try GPT-4o first** (easiest upgrade):
   - Set `OPENAI_MODEL=gpt-4o` in `.env`
   - Better constraint handling than `gpt-4o-mini`
   
2. **Check GPT-4.5 availability**:
   - Verify via API: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
   - If available, try `gpt-4.5` or `gpt-4.5-turbo`
   
3. **Consider Claude 3.5 Sonnet** for best structured outputs:
   - Has native structured outputs with JSON schema validation
   - Better at following complex constraints

