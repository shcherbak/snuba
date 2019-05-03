<img src="/snuba/static/img/snuba.svg" width="150" height="71"/>

A service providing fast event searching, filtering and aggregation on arbitrary fields.

## Sentry + Snuba

Add/change the following lines in `~/.sentry/sentry.conf.py`:

    SENTRY_SEARCH = 'sentry.search.snuba.SnubaSearchBackend'
    SENTRY_TAGSTORE = 'sentry.tagstore.snuba.SnubaCompatibilityTagStorage'
    SENTRY_TSDB = 'sentry.tsdb.redissnuba.RedisSnubaTSDB'
    SENTRY_EVENTSTREAM = 'sentry.eventstream.snuba.SnubaEventStream'

Run:

    sentry devservices up

Access raw clickhouse client (similar to psql):

    docker exec -it sentry_clickhouse clickhouse-client

Data is written into the table `dev`: `select count() from dev;`

## Requirements (Only required if you are developing against Snuba)

Snuba assumes:

1. A Clickhouse server endpoint at `CLICKHOUSE_SERVER` (default `localhost:9000`).
2. A redis instance running at `REDIS_HOST` (default `localhost`). On port
   `6379`

## Install / Run (Only required if you are developing against Snuba)

    mkvirtualenv snuba
    workon snuba

    # Run API server
    snuba api

## API

Snuba exposes an HTTP API (default port: `1218`) with the following endpoints.

- [/](/): Shows this page.
- [/dashboard](/dashboard): Query dashboard
- [/query](/query): Endpoint for querying clickhouse.
- [/config](/config): Console for runtime config options

## Settings

Settings are found in `settings.py`

- `CLICKHOUSE_SERVER` : The endpoint for the clickhouse service.
- `CLICKHOUSE_TABLE` : The clickhouse table name.
- `REDIS_HOST` : The host redis is running on.

## Tests

    pip install -e .

    export CLICKHOUSE_SERVER=127.0.0.1:9000

    make test

## Querying

Try out queries on the [query console](/query). Queries are submitted as a JSON
body to the [/query](/query) endpoint.

### The Query Payload

An example query body might look like:

    {
        "project":[1,2],
        "selected_columns": ["tags[environment]"],
        "aggregations": [
            ["max", "received", "last_seen"]
        ],
        "conditions": [
            ["tags[environment]", "=", "prod"]
        ],
        "from_date": "2011-07-01T19:54:15",
        "to_date": "2018-07-06T19:54:15"
        "granularity": 3600,
        "groupby": ["issue", "time"],
        "having": [],
        "issues": [],
    }

#### selected_columns, groupby

`groupby` is a list of columns (or column aliases) that will be translated into
a SQL `GROUP BY` clause. These columns are automatically included in the query
output.  `selected_columns` is a list of additional columns that should be added
to the `SELECT` clause.

Trying to use both of these in the same query will probably result in an invalid
query, as you cannot select a bare column, while grouping by another column, as
the value of the extra selected column for a given output row (group) would be
ambiguous.

#### aggregations

This is an array of 3-tuples of the form:

    [function, column, alias]

which is transformed into the SQL:

    function(column) AS alias

Some aggregation function are generated by other functions, eg topK. so an
example query would send:

    ["topK(5)", "environment", "top_five_envs"]

To produce the SQL:

    topK(5)(environment) AS top_five_envs

Count is a somewhat special case, it doesn't have a column argument, and is
specified as "count()", not "count".

    ["count()", null, "item_count"]

Aggregations are also included in the output columns automatically.


#### conditions

Conditions are used to construct the WHERE clause, and consist of an
array of 3-tuples (in their most basic form):

    [column_name, operation, literal]

Valid operations:

    ['>', '<', '>=', '<=', '=', '!=', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'NOT LIKE'],

For example:

    [
        ['platform', '=', 'python'],
    ]

    platform = 'python'

Top-level sibling conditions are `AND`ed together:

    [
        ['w', '=', '1'],
        ['x', '=', '2'],
    ]

    w = '1' AND x = '2'

The first position (column_name) can be replaced with an array that
represents a function call. The first item is a function name, and nested
arrays represent the arguments supplied to the preceding function:

    [
        [['fn1', []], '=', '1'],
    ]

    fn1() = '1'

Multiple arguments can be provided:

    [
        [['fn2', ['arg', 'arg']], '=', '2'],
    ]

    fn2(arg, arg) = '2'

Function calls can be nested:

    [
        [['fn3', ['fn4', ['arg']]], '=', '3'],
    ]

    fn3(fn4(arg)) = '3'

An alias can be provided at the end of the top-level function array. This
alias can then be used elsewhere in the query, such as `selected_columns`:

    [
        [['fn1', [], 'alias'], '=', '1'],
    ]

    (fn1() AS alias) = '1'

To do an `OR`, nest the array one level deeper:

    [
        [
            ['w', '=', '1'],
            ['x', '=', '2'],
        ],
    ]

    (w = '1' OR x = '2')

Sibling arrays at the second level are `AND`ed (note this is the same
as the simpler `AND` above):

    [
        [
            ['w', '=', '1'],
        ],
        [
            ['x', '=', '2'],
        ],
    ]

    (w = '1' AND x = '2')

And these two can be combined to mix `OR` and `AND`:

    [
        [
            ['w', '=', '1'], ['x', '=', '2']
        ],
        [
            ['y', '=', '3'], ['z', '=', '4']
        ],
    ]

    (w = '1' OR x = '2') AND (y = '3' OR z = '4')

#### from_date / to_date

#### granularity

Snuba provides a magic column `time`, that you can use in groupby or filter
expressions. This column gives a floored time value for each event so that
events in the same minute/hour/day/etc. can be grouped.

`granularity` determines the number of seconds in each of these time buckets.
Eg, to count the number of events by hour, you would do

    {
        "aggregations": [["count()", "", "event_count"]],
        "granularity": 3600,
        "groupby": "time"
    }

#### having

#### issues

#### project

#### sample

Sample is a numeric value. If it is < 1, then it is interpreted to mean "read
this percentage of rows". eg.

    "sample": 0.5

Will read 50% of all rows.

If it is > 1, it means "read up to this number of rows", eg.

    "sample": 1000

Will read 1000 rows maximum, and then return a result.

Note that sampling does not do any adjustment/correction of aggregates. so if
you do a count() with 10% sampling, you should multiply the results by 10 to
get an approximate value for the 'real' count. For sample > 1 you cannot do
this adjustment as there is no way to tell what percentage of rows were read.
For other aggregations like uniq(), min(), max(), there is no adjustment you
can do, the results will simply deviate more and more from the real value in an
unpredictable way as the sampling rate approaches 0.

Queries with sampling are stable. Ie the same query with the same sampling
factor over the same data should consistently return the exact same result.


### Issues / Groups

Snuba provides a magic column `issue` that can be used to group events by issue.

Because events can be reassigned to different issues through merging, and
because snuba does not support updates, we cannot store the issue id for an
event in snuba. If you want to filter or group by `issue`, you need to pass a
list of `issues` into the query.  This list is a mapping from issue ids to the
event `primary_hash`es in that issue. Snuba automatically expands this mapping
into the query so that filters/grouping on `issue` will just work.

### Tags

Event tags are stored in one of 2 ways. Promoted tags are the ones we expect to
be queried often and as such are stored as top level columns. The list of
promoted tag columns is defined in settings and is somewhat fixed in the
schema. The rest of an event's tags are stored as a key-value map.  In practice
this is implemented as 2 columns of type Array(String), called `tags.key` and
`tags.value`

The snuba service provides 2 mechanisms for abstracting this tiered tag
structure by providing some special columns that will be resolved to the
correct SQL expression for the type of tag. These mechanisms should generally
not be used in conjunction with each other.

#### When you know the names of the tags you want.

You can use the `tags[name]` anywhere you would use a normal column name in an
expression, and it will resolve to the value of the tag with `name`, regardless
of whether that tag is promoted or not. Use this syntax when you are looking
for a specific named tag. eg.

    # Find all events in production with user_custom_key defined.
    "conditions": [
        ["tags[environment]", "=", "prod"],
        ["tags[custom_user_tag]", "IS NOT NULL"]
    ],
<!-- -->

    # Find the number of unique environments
    "aggregations": [
        ["uniq", "tags[environment]", "unique_envs"],
    ],

#### When you don't know the name, or want to query all tags.

These are virtual columns that can be used to get results when the names of the
tags are not explicitly known. Using `tags_key` or `tags_value` in an
expression will expand all of the promoted and non-promoted tags so that there
is one row per tag (an array-join in Clickhouse terms). For each row, the name
of the tag will be in the `tags_key` column, and the value in the `tags_value`
column.

    # Find the top 5 most often used tags
    "aggregations": [
        ["top5", "tags_key", "top_tag_keys"],
    ],
<!-- -->

    # Find any tags whose *value* is `bar`
    "conditions": [
        ["tags_value", "=", "bar"],
    ],


Note, when using this expression. the thing you are counting is tags, not events, so if you
have 10 events, each of which has 10 tags, then a `count()` of `tags_key` will return 100.
