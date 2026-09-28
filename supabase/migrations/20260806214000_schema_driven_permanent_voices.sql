-- EverBond AI — permanent schema-driven Qwen 3 voice profiles
-- Run this entire file once in Supabase SQL Editor.
--
-- This migration uses the character data you already have:
-- category, role, tags, title, opening scenario, first message,
-- relationship context, ai_profile, quality_control, and voice_gender.
--
-- It does NOT create a second character schema or a voice_profile column.
-- The permanent voice settings live in the existing feature_flags JSON.
--
-- Safety:
-- * EverBond Girls use the female pool.
-- * EverBond Guys use the male pool.
-- * Anime & Fantasy, mixed/public, and user-created records must have explicit
--   schema evidence or an existing female/male voice_gender value.
-- * If any record cannot be classified safely, the transaction aborts before
--   changing character data.
-- * Once assigned, the trigger permanently preserves the voice identity and
--   delivery profile across imports and ordinary character edits.

begin;

create or replace function public.everbond_voice_schema_text(
  p_section text,
  p_category text,
  p_role text,
  p_relationship_pace text,
  p_tags text[],
  p_title text,
  p_opening_scenario text,
  p_first_message text,
  p_relationship_context text,
  p_ai_profile jsonb,
  p_quality_control jsonb
)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select lower(
    concat_ws(
      ' ',
      coalesce(p_section, ''),
      coalesce(p_category, ''),
      coalesce(p_role, ''),
      coalesce(p_relationship_pace, ''),
      coalesce(array_to_string(p_tags, ' '), ''),
      coalesce(p_title, ''),
      coalesce(p_opening_scenario, ''),
      coalesce(p_first_message, ''),
      coalesce(p_relationship_context, ''),
      coalesce(p_ai_profile, '{}'::jsonb)::text,
      coalesce(p_quality_control, '{}'::jsonb)::text
    )
  );
$function$;

create or replace function public.everbond_voice_regex_count(
  p_source text,
  p_pattern text
)
returns integer
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select count(*)::integer
  from regexp_matches(
    lower(coalesce(p_source, '')),
    p_pattern,
    'g'
  );
$function$;

create or replace function public.everbond_voice_clamp(
  p_value numeric,
  p_minimum numeric,
  p_maximum numeric
)
returns numeric
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select least(greatest(p_value, p_minimum), p_maximum);
$function$;

create or replace function public.everbond_voice_jitter(
  p_character_id text,
  p_channel text,
  p_amount numeric
)
returns numeric
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select (
    (
      get_byte(
        decode(md5(coalesce(p_character_id, '') || ':' || p_channel), 'hex'),
        0
      )::numeric / 255.0
    ) * 2.0 - 1.0
  ) * p_amount;
$function$;

create or replace function public.everbond_infer_voice_gender(
  p_existing_gender text,
  p_category text,
  p_role text,
  p_title text,
  p_opening_scenario text,
  p_first_message text,
  p_relationship_context text,
  p_ai_profile jsonb,
  p_quality_control jsonb,
  p_schema_text text
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $function$
declare
  v_direct text;
  v_identity text;
  v_male_score integer := 0;
  v_female_score integer := 0;
  v_male_relationship boolean := false;
  v_female_relationship boolean := false;
begin
  if p_existing_gender in ('female', 'male') then
    return p_existing_gender;
  end if;

  -- These official catalog sections are already explicit identity data.
  if p_category = 'everbond-guys' then
    return 'male';
  end if;

  if p_category = 'everbond-girls' then
    return 'female';
  end if;

  v_direct := lower(
    concat_ws(
      ' ',
      p_ai_profile ->> 'gender',
      p_ai_profile ->> 'pronouns',
      p_ai_profile #>> '{visual_identity,gender}',
      p_ai_profile #>> '{visual_identity,pronouns}',
      p_ai_profile #>> '{personality_core,gender}',
      p_ai_profile #>> '{personality_core,pronouns}',
      p_quality_control ->> 'gender',
      p_quality_control ->> 'pronouns'
    )
  );

  if v_direct ~ '\m(female|woman|girl|she|her|hers|she/her)\M'
     and v_direct !~ '\m(male|man|boy|he|him|his|he/him)\M'
  then
    return 'female';
  end if;

  if v_direct ~ '\m(male|man|boy|he|him|his|he/him)\M'
     and v_direct !~ '\m(female|woman|girl|she|her|hers|she/her)\M'
  then
    return 'male';
  end if;

  v_identity := lower(
    concat_ws(
      ' ',
      coalesce(p_role, ''),
      coalesce(p_title, ''),
      coalesce(p_relationship_context, '')
    )
  );

  v_male_relationship :=
    v_identity ~ '\m(boyfriend|husband|fiancé|fiance|groom|prince|king|father|dad|brother|son|gentleman)\M';

  v_female_relationship :=
    v_identity ~ '\m(girlfriend|wife|fiancée|fiancee|bride|princess|queen|mother|mom|sister|daughter|lady)\M';

  if v_male_relationship and not v_female_relationship then
    return 'male';
  end if;

  if v_female_relationship and not v_male_relationship then
    return 'female';
  end if;

  v_male_score :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(he|him|his|himself|male|man|boy|boyfriend|husband|fiancé|fiance|groom|prince|king|father|dad|brother|son|gentleman)\M'
      );

  v_female_score :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(she|her|hers|herself|female|woman|girl|girlfriend|wife|fiancée|fiancee|bride|princess|queen|mother|mom|sister|daughter|lady)\M'
      );

  if v_male_score >= 1
     and v_female_score = 0
  then
    return 'male';
  end if;

  if v_female_score >= 1
     and v_male_score = 0
  then
    return 'female';
  end if;

  if v_male_score >= 2
     and v_male_score >= v_female_score + 2
  then
    return 'male';
  end if;

  if v_female_score >= 2
     and v_female_score >= v_male_score + 2
  then
    return 'female';
  end if;

  return null;
end;
$function$;

create or replace function public.everbond_choose_character_voice(
  p_character_id text,
  p_gender text,
  p_schema_text text
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $function$
declare
  v_serena numeric;
  v_vivian numeric;
  v_sohee numeric;
  v_ono numeric;
  v_aiden numeric;
  v_ryan numeric;
begin
  if p_gender = 'female' then
    v_serena :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(warm|caring|comfort|comforting|affectionate|romantic|tender|nurturing|loyal|gentle|grounded|calm|sincere|sweet|softhearted|kind)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Serena', 0.49);

    v_vivian :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(confident|elegant|poised|regal|polished|sophisticated|commanding|dominant|assertive|refined|leader|professional|composed|fierce)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Vivian', 0.49);

    v_sohee :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(playful|mischievous|cheerful|energetic|bubbly|bright|teasing|adventurous|sunny|flirty|competitive|excited|bold|spontaneous|whimsical)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Sohee', 0.49);

    v_ono :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(shy|reserved|quiet|mysterious|gothic|dreamy|introverted|nervous|soft-spoken|hesitant|stoic|dark|brooding|guarded|slow burn)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Ono_Anna', 0.49);

    if v_vivian > v_serena
       and v_vivian >= v_sohee
       and v_vivian >= v_ono
    then
      return 'Vivian';
    end if;

    if v_sohee > v_serena
       and v_sohee > v_vivian
       and v_sohee >= v_ono
    then
      return 'Sohee';
    end if;

    if v_ono > v_serena
       and v_ono > v_vivian
       and v_ono > v_sohee
    then
      return 'Ono_Anna';
    end if;

    return 'Serena';
  end if;

  if p_gender = 'male' then
    v_aiden :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(warm|caring|protective|gentle|loyal|calm|grounded|reserved|tender|sincere|soft|kind|steady|comforting|devoted)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Aiden', 0.49);

    v_ryan :=
      public.everbond_voice_regex_count(
        p_schema_text,
        '\m(confident|bold|playful|sarcastic|dominant|commanding|competitive|mischievous|adventurous|energetic|teasing|assertive|fierce|cocky|charismatic)\M'
      ) * 3
      + public.everbond_voice_jitter(p_character_id, 'Ryan', 0.49);

    if v_ryan > v_aiden then
      return 'Ryan';
    end if;

    return 'Aiden';
  end if;

  return null;
end;
$function$;

create or replace function public.everbond_character_voice_flags(
  p_character_id text,
  p_gender text,
  p_voice_id text,
  p_role text,
  p_ai_profile jsonb,
  p_schema_text text
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_catalog
as $function$
declare
  v_base_speed numeric;
  v_base_temperature numeric;
  v_base_top_p numeric;
  v_base_energy numeric;
  v_base_warmth numeric;
  v_base_confidence numeric;

  v_lively integer;
  v_quiet integer;
  v_warm integer;
  v_cool integer;
  v_confident integer;
  v_shy integer;

  v_speed numeric;
  v_temperature numeric;
  v_top_p numeric;
  v_energy numeric;
  v_warmth numeric;
  v_confidence numeric;

  v_emotion text;
  v_delivery text;
begin
  case p_voice_id
    when 'Serena' then
      v_base_speed := 0.95;
      v_base_temperature := 0.77;
      v_base_top_p := 0.93;
      v_base_energy := 0.56;
      v_base_warmth := 0.88;
      v_base_confidence := 0.66;
    when 'Vivian' then
      v_base_speed := 0.93;
      v_base_temperature := 0.75;
      v_base_top_p := 0.92;
      v_base_energy := 0.62;
      v_base_warmth := 0.67;
      v_base_confidence := 0.88;
    when 'Sohee' then
      v_base_speed := 1.03;
      v_base_temperature := 0.86;
      v_base_top_p := 0.96;
      v_base_energy := 0.83;
      v_base_warmth := 0.72;
      v_base_confidence := 0.72;
    when 'Ono_Anna' then
      v_base_speed := 0.90;
      v_base_temperature := 0.72;
      v_base_top_p := 0.91;
      v_base_energy := 0.42;
      v_base_warmth := 0.82;
      v_base_confidence := 0.54;
    when 'Aiden' then
      v_base_speed := 0.94;
      v_base_temperature := 0.76;
      v_base_top_p := 0.93;
      v_base_energy := 0.56;
      v_base_warmth := 0.80;
      v_base_confidence := 0.74;
    when 'Ryan' then
      v_base_speed := 1.00;
      v_base_temperature := 0.84;
      v_base_top_p := 0.95;
      v_base_energy := 0.78;
      v_base_warmth := 0.64;
      v_base_confidence := 0.86;
    else
      raise exception 'INVALID_EVERBOND_VOICE_ID:%', p_voice_id;
  end case;

  v_lively := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(energetic|excited|bright|bubbly|playful|mischievous|cheerful|bold|adventurous|spontaneous|competitive)\M'
    ),
    3
  );

  v_quiet := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(shy|reserved|quiet|soft-spoken|hesitant|nervous|stoic|guarded|brooding)\M'
    ),
    3
  );

  v_warm := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(warm|caring|comforting|affectionate|tender|nurturing|gentle|sweet|kind|loyal|devoted)\M'
    ),
    3
  );

  v_cool := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(cold|aloof|detached|stern|icy|distant|severe)\M'
    ),
    3
  );

  v_confident := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(confident|dominant|commanding|assertive|bold|poised|regal|leader|fierce|competitive)\M'
    ),
    3
  );

  v_shy := least(
    public.everbond_voice_regex_count(
      p_schema_text,
      '\m(shy|timid|nervous|hesitant|insecure|bashful|reserved)\M'
    ),
    3
  );

  v_speed := public.everbond_voice_clamp(
    v_base_speed
      + v_lively * 0.012
      - v_quiet * 0.014
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_speed',
          0.018
        ),
    0.84,
    1.10
  );

  v_temperature := public.everbond_voice_clamp(
    v_base_temperature
      + v_lively * 0.012
      - v_quiet * 0.010
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_temperature',
          0.018
        ),
    0.62,
    0.96
  );

  v_top_p := public.everbond_voice_clamp(
    v_base_top_p
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_top_p',
          0.012
        ),
    0.86,
    0.99
  );

  v_energy := public.everbond_voice_clamp(
    v_base_energy
      + v_lively * 0.045
      - v_quiet * 0.045
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_energy',
          0.025
        ),
    0.20,
    0.96
  );

  v_warmth := public.everbond_voice_clamp(
    v_base_warmth
      + v_warm * 0.035
      - v_cool * 0.040
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_warmth',
          0.025
        ),
    0.25,
    0.98
  );

  v_confidence := public.everbond_voice_clamp(
    v_base_confidence
      + v_confident * 0.040
      - v_shy * 0.045
      + public.everbond_voice_jitter(
          p_character_id,
          'voice_confidence',
          0.025
        ),
    0.24,
    0.98
  );

  if p_schema_text ~ '\m(gothic|mysterious|dark|brooding|reserved|guarded)\M' then
    v_emotion := 'restrained, intimate mystery';
  elsif p_schema_text ~ '\m(playful|mischievous|teasing|cheerful|bubbly)\M' then
    v_emotion := 'playful romantic energy';
  elsif p_schema_text ~ '\m(confident|dominant|commanding|poised|regal)\M' then
    v_emotion := 'poised emotional confidence';
  elsif p_schema_text ~ '\m(shy|nervous|hesitant|bashful)\M' then
    v_emotion := 'soft, sincere vulnerability';
  else
    v_emotion := 'warm emotional intimacy';
  end if;

  v_delivery := left(
    coalesce(
      nullif(p_ai_profile #>> '{speech_style,voice}', ''),
      nullif(p_ai_profile #>> '{speech_style,sentence_style}', ''),
      nullif(p_ai_profile ->> 'speech_style', ''),
      nullif(p_role, ''),
      'Natural, emotionally aware, conversational speech'
    ),
    220
  );

  return jsonb_build_object(
    'voice_enabled', true,
    'voice_profile_version', 1,
    'voice_assignment_source', 'character-schema-v1',
    'voice_schema_fingerprint', md5(coalesce(p_schema_text, '')),
    'voice_id', p_voice_id,
    'voice_speed', round(v_speed, 2),
    'voice_temperature', round(v_temperature, 2),
    'voice_top_p', round(v_top_p, 2),
    'voice_energy', round(v_energy, 2),
    'voice_warmth', round(v_warmth, 2),
    'voice_confidence', round(v_confidence, 2),
    'voice_emotion', v_emotion,
    'voice_delivery', v_delivery
  );
end;
$function$;

create or replace function public.everbond_voice_only_keys(
  p_flags jsonb
)
returns jsonb
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_flags, '{}'::jsonb)) as entry
  where entry.key = any(
    array[
      'voice_enabled',
      'voice_profile_version',
      'voice_assignment_source',
      'voice_schema_fingerprint',
      'voice_id',
      'voice_speed',
      'voice_temperature',
      'voice_top_p',
      'voice_energy',
      'voice_warmth',
      'voice_confidence',
      'voice_emotion',
      'voice_delivery'
    ]::text[]
  );
$function$;

create or replace function public.everbond_voice_without_keys(
  p_flags jsonb
)
returns jsonb
language sql
immutable
set search_path = public, pg_catalog
as $function$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_flags, '{}'::jsonb)) as entry
  where not (
    entry.key = any(
      array[
        'voice_enabled',
        'voice_profile_version',
        'voice_assignment_source',
        'voice_schema_fingerprint',
        'voice_id',
        'voice_speed',
        'voice_temperature',
        'voice_top_p',
        'voice_energy',
        'voice_warmth',
        'voice_confidence',
        'voice_emotion',
        'voice_delivery'
      ]::text[]
    )
  );
$function$;

create temporary table everbond_voice_plan
on commit drop
as
with source as (
  select
    characters.id,
    characters.name,
    characters.category,
    characters.voice_gender as existing_gender,
    characters.role,
    characters.title,
    characters.opening_scenario,
    characters.first_message,
    characters.relationship_context,
    characters.ai_profile,
    characters.quality_control,
    characters.feature_flags,
    public.everbond_voice_schema_text(
      characters.section,
      characters.category,
      characters.role,
      characters.relationship_pace,
      characters.tags,
      characters.title,
      characters.opening_scenario,
      characters.first_message,
      characters.relationship_context,
      characters.ai_profile,
      characters.quality_control
    ) as schema_text
  from public.characters as characters
),
gendered as (
  select
    source.*,
    public.everbond_infer_voice_gender(
      source.existing_gender,
      source.category,
      source.role,
      source.title,
      source.opening_scenario,
      source.first_message,
      source.relationship_context,
      source.ai_profile,
      source.quality_control,
      source.schema_text
    ) as resolved_gender
  from source
)
select
  gendered.id,
  gendered.name,
  gendered.category,
  gendered.resolved_gender,
  public.everbond_choose_character_voice(
    gendered.id,
    gendered.resolved_gender,
    gendered.schema_text
  ) as voice_id,
  gendered.role,
  gendered.ai_profile,
  gendered.schema_text
from gendered;

-- Read-only plan shown before any character row is changed.
select
  coalesce(resolved_gender, 'UNRESOLVED') as voice_gender,
  coalesce(voice_id, 'UNRESOLVED') as voice_id,
  count(*) as characters
from everbond_voice_plan
group by resolved_gender, voice_id
order by voice_gender, voice_id;

-- If this returns rows, the safety check below aborts with zero character changes.
select
  id,
  name,
  category
from everbond_voice_plan
where resolved_gender is null
   or voice_id is null
order by category, name
limit 100;

do $function$
declare
  v_unresolved integer;
begin
  select count(*)
  into v_unresolved
  from everbond_voice_plan
  where resolved_gender is null
     or voice_id is null;

  if v_unresolved > 0 then
    raise exception
      'VOICE_ASSIGNMENT_ABORTED: % character(s) lack safe schema gender evidence. No character data was changed.',
      v_unresolved;
  end if;
end;
$function$;

update public.characters as characters
set
  voice_gender = plan.resolved_gender,
  feature_flags =
    public.everbond_voice_without_keys(characters.feature_flags)
    ||
    public.everbond_character_voice_flags(
      plan.id,
      plan.resolved_gender,
      plan.voice_id,
      plan.role,
      plan.ai_profile,
      plan.schema_text
    )
from everbond_voice_plan as plan
where plan.id = characters.id;

do $function$
declare
  v_wrong_pool integer;
  v_missing_voices text[];
begin
  select count(*)
  into v_wrong_pool
  from public.characters
  where
    (
      voice_gender = 'female'
      and feature_flags ->> 'voice_id' not in (
        'Serena',
        'Vivian',
        'Sohee',
        'Ono_Anna'
      )
    )
    or
    (
      voice_gender = 'male'
      and feature_flags ->> 'voice_id' not in (
        'Aiden',
        'Ryan'
      )
    );

  if v_wrong_pool > 0 then
    raise exception
      'VOICE_ASSIGNMENT_ABORTED: % character(s) were assigned outside their gender pool.',
      v_wrong_pool;
  end if;

  select array_agg(required_voice)
  into v_missing_voices
  from (
    select unnest(
      array[
        'Serena',
        'Vivian',
        'Sohee',
        'Ono_Anna',
        'Aiden',
        'Ryan'
      ]::text[]
    ) as required_voice
  ) as required
  where not exists (
    select 1
    from public.characters
    where feature_flags ->> 'voice_id' = required.required_voice
  );

  if coalesce(array_length(v_missing_voices, 1), 0) > 0 then
    raise exception
      'VOICE_ASSIGNMENT_ABORTED: these selected voices were not used: %',
      array_to_string(v_missing_voices, ', ');
  end if;
end;
$function$;

alter table public.characters
  alter column voice_gender set default 'neutral';

alter table public.characters
  alter column voice_gender set not null;

alter table public.characters
  drop constraint if exists characters_voice_gender_check;

alter table public.characters
  add constraint characters_voice_gender_check
  check (voice_gender in ('female', 'male'));

alter table public.characters
  drop constraint if exists characters_voice_pool_check;

alter table public.characters
  add constraint characters_voice_pool_check
  check (
    (
      voice_gender = 'female'
      and feature_flags ->> 'voice_id' in (
        'Serena',
        'Vivian',
        'Sohee',
        'Ono_Anna'
      )
    )
    or
    (
      voice_gender = 'male'
      and feature_flags ->> 'voice_id' in (
        'Aiden',
        'Ryan'
      )
    )
  );

create index if not exists characters_voice_id_idx
  on public.characters ((feature_flags ->> 'voice_id'));

create or replace function public.preserve_or_assign_character_voice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_schema_text text;
  v_gender text;
  v_voice_id text;
begin
  if tg_op = 'UPDATE'
     and old.feature_flags ->> 'voice_id' is not null
  then
    new.voice_gender := old.voice_gender;
    new.feature_flags :=
      public.everbond_voice_without_keys(new.feature_flags)
      ||
      public.everbond_voice_only_keys(old.feature_flags);
    return new;
  end if;

  v_schema_text := public.everbond_voice_schema_text(
    new.section,
    new.category,
    new.role,
    new.relationship_pace,
    new.tags,
    new.title,
    new.opening_scenario,
    new.first_message,
    new.relationship_context,
    new.ai_profile,
    new.quality_control
  );

  v_gender := public.everbond_infer_voice_gender(
    new.voice_gender,
    new.category,
    new.role,
    new.title,
    new.opening_scenario,
    new.first_message,
    new.relationship_context,
    new.ai_profile,
    new.quality_control,
    v_schema_text
  );

  if v_gender is null then
    raise exception
      'CHARACTER_VOICE_GENDER_REQUIRED:%',
      coalesce(new.id, new.name, 'unknown');
  end if;

  v_voice_id := public.everbond_choose_character_voice(
    new.id,
    v_gender,
    v_schema_text
  );

  if v_voice_id is null then
    raise exception
      'CHARACTER_VOICE_ASSIGNMENT_FAILED:%',
      coalesce(new.id, new.name, 'unknown');
  end if;

  new.voice_gender := v_gender;
  new.feature_flags :=
    public.everbond_voice_without_keys(new.feature_flags)
    ||
    public.everbond_character_voice_flags(
      new.id,
      v_gender,
      v_voice_id,
      new.role,
      new.ai_profile,
      v_schema_text
    );

  return new;
end;
$function$;

drop trigger if exists preserve_or_assign_character_voice
  on public.characters;

create trigger preserve_or_assign_character_voice
before insert or update
on public.characters
for each row
execute function public.preserve_or_assign_character_voice();

comment on column public.characters.voice_gender is
  'Authoritative permanent female/male Qwen 3 TTS pool.';

comment on function public.preserve_or_assign_character_voice() is
  'Assigns a schema-matched EverBond voice on first insert and permanently preserves it across later imports and edits.';

commit;

-- Final verification. All six voices must appear and every row must be valid.
select
  voice_gender,
  feature_flags ->> 'voice_id' as voice_id,
  count(*) as characters,
  round(avg((feature_flags ->> 'voice_speed')::numeric), 2) as avg_speed,
  round(avg((feature_flags ->> 'voice_energy')::numeric), 2) as avg_energy,
  round(avg((feature_flags ->> 'voice_warmth')::numeric), 2) as avg_warmth,
  round(avg((feature_flags ->> 'voice_confidence')::numeric), 2) as avg_confidence
from public.characters
group by
  voice_gender,
  feature_flags ->> 'voice_id'
order by voice_gender, voice_id;

select
  count(*) filter (
    where voice_gender = 'female'
      and feature_flags ->> 'voice_id' in (
        'Serena',
        'Vivian',
        'Sohee',
        'Ono_Anna'
      )
  ) as valid_female_characters,
  count(*) filter (
    where voice_gender = 'male'
      and feature_flags ->> 'voice_id' in (
        'Aiden',
        'Ryan'
      )
  ) as valid_male_characters,
  count(*) filter (
    where feature_flags ->> 'voice_id' is null
  ) as missing_voice_assignments,
  count(*) as total_characters
from public.characters;
