import { create } from 'rung-sdk';
import { String as Text, Natural } from 'rung-sdk/dist/types';
import Bluebird from 'bluebird';
import agent from 'superagent';
import promisifyAgent from 'superagent-promise';
import { map, mergeAll, filter, propSatisfies, lte, gte, isNil, allPass } from 'ramda';
import moment from 'moment';

const request = promisifyAgent(agent, Bluebird);

function render(showName, season, number, name, airdate) {
    return `${showName} S${season}E${number} - ${name} (${moment(airdate).format('DD/MM/YYYY')})`;
}

function createAlert(episode, showId, showName, { average }, network) {
    const { id, name, season, number, airdate, airtime, image, summary, url } = episode;
    const channel = `${network.name} - ${network.country.code}`;

    return {
        [showId + id]: {
            title: `${showName} S${season}E${number} - ${name} (${moment(airdate).format('DD/MM/YYYY')})`,
            content: render(showName, season, number, name, airdate),
            comment: `
                ### ${name} ${_('at')} ${airtime} ${_('on')} ${channel}

                ${isNil(summary) ? '' : `\n${summary}`}

                [${_('See episode info')}](${url})
            `,
            resources: isNil(image) ? [] : [image.medium]
        }
    };
}

function EndedShowError(id, name, url) {
    this.name = 'EndedShowError';
    this.message = {
        [id]: {
            title: `${name} ${_('is already completed.')}`,
            content: `${name} ${_('is already completed.')}`,
            comment: `**${name}** ${_('is already finished, but if you want to know more about the series')}, [${_('access here')}](${url})`
        }
    };
}

function main(context, done) {
    const { show, days } = context.params;
    const server = `https://api.tvmaze.com/singlesearch/shows?q=${show}&embed=episodes`;

    return request.get(server)
        .then(({ body }) => {
            const { id, name, rating, network, _embedded, status, url } = body;

            if (status === 'Ended') {
                throw new EndedShowError(id, name, url);
            }

            const today = moment().format('YYYY-MM-DD');
            const maxDay = moment().add(days, 'days').format('YYYY-MM-DD');
            const isBetween = allPass([lte(today), gte(maxDay)]);
            const episodes = filter(
                propSatisfies(isBetween, 'airdate'),
                _embedded.episodes
            );
            const alerts = mergeAll(map(
                episode => createAlert(episode, id, name, rating, network),
                episodes
            ));
            done({ alerts });
        })
        .catch(err => {
            return err instanceof EndedShowError
                ? done({ alerts: err.message })
                : done({ alerts: {} });
        });
}

const params = {
    show: {
        description: _('Which series do you want to follow?'),
        type: Text,
        required: true
    },
    days: {
        description: _('How many days before do you want to be informed?'),
        type: Natural,
        default: 30
    }
};

export default create(main, {
    params,
    primaryKey: true,
    title: _('New episodes'),
    description: _('Find out when the next episode of your favorite series will come out.'),
    preview: render('Game of Thrones', '06', '01', _('The Red Woman'), '20160424')
});
