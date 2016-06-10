# io-overwatch

```
CREATE TABLE `io_event` (
  `eventType` varchar(256) NOT NULL,
  `fullPath` varchar(256) DEFAULT NULL,
  `stats` varchar(512) DEFAULT NULL,
  `timestamp` varchar(256) DEFAULT NULL,
  `filename` varchar(256) DEFAULT NULL,
  `uuid` varchar(256) DEFAULT NULL,
  `parentPath` varchar(256) DEFAULT NULL,
  `parentName` varchar(256) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

## Usage sample one:

Monitor one dir, when any file matching \*test1\* is changed
make a new target directory, move all files in the same directory
as triggering file to the target dir, and then insert a sql record
of the event.

```
node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=change \
	--evaluator.regex=".*test1.*" \
	--evaluator.reactors=mkdir moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
    --reactor.sqlInsert.columns=eventType fullPath filename parentPath timestamp uuid \
	--reactor.sqlInsert.values="{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}"\
	--reactor.db.host=localhost \
	--reactor.db.user=me \
	--reactor.db.pw=123 \
	--reactor.db.name=io_event_reactor
```


## Usage sample one:

Monitor one dir, when any file matching \*test1.zip is changed
make a new target directory, extract the zip to the target dir, then move all files in the same directory
as triggering file to the target dir, and then insert a sql record
of the event.

```
node overwatch.js dir  \
	--logging.file=./overwatch.log \
	--monitor.dir=/tmp/bitsofinfo \
	--monitor.stabilityThreshold=1000 \
	--evaluator.events=add change \
	--evaluator.regex=".*test1.zip" \
	--evaluator.reactors=mkdir extractFileTo moveAll sqlInsert \
	--reactor.mkdir.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.extractFileTo.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.moveAll.target=/tmp/{{{ioEvent.context.timestamp}}}/{{{ioEvent.parentName}}}/bitsofinfo_target \
	--reactor.sqlInsert.table=io_event \
	--reactor.sqlInsert.columns=eventType fullPath filename parentPath timestamp uuid \
	--reactor.sqlInsert.values="{{{ioEvent.eventType}}}" "{{{ioEvent.fullPath}}}" "{{{ioEvent.filename}}}" "{{{ioEvent.parentPath}}}" "{{{ioEvent.context.timestamp}}}" "{{{ioEvent.uuid}}}"\
	--reactor.db.host=localhost \
	--reactor.db.user=me \
	--reactor.db.pw=123 \
	--reactor.db.name=io_event_reactor
```
